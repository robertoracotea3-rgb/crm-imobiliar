import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getValidToken, olxFetch } from '@/lib/storia-api';
import { nextRemovalAttempt, safePortalError } from '@/lib/transactions';

interface ClaimedRemoval {
  id: string;
  transaction_id: string;
  property_id: string;
  portal_listing_id: string;
  portal: string;
  external_id: string | null;
  attempts: number;
  max_attempts: number;
}

export interface RemovalDelivery {
  id: string;
  portal: string;
  status: 'confirmed' | 'retry' | 'failed';
  error?: string;
}

async function finish(
  serviceAdmin: SupabaseClient,
  agencyId: string,
  job: ClaimedRemoval,
  success: boolean,
  error?: unknown,
): Promise<RemovalDelivery> {
  const safeError = success ? null : safePortalError(error);
  const { data, error: rpcError } = await serviceAdmin.rpc('crm_finish_portal_removal_job', {
    p_agency_id: agencyId,
    p_job_id: job.id,
    p_success: success,
    p_error: safeError,
    p_retry_at: success ? null : nextRemovalAttempt(job.attempts),
  });
  if (rpcError) throw new Error(rpcError.message);
  const status = String(data) as RemovalDelivery['status'];
  return { id: job.id, portal: job.portal, status, ...(safeError ? { error: safeError } : {}) };
}

export async function processPortalRemovalJobs(
  serviceAdmin: SupabaseClient,
  agencyId: string,
  options: { transactionId?: string | null; jobId?: string | null; limit?: number } = {},
): Promise<RemovalDelivery[]> {
  const { data, error } = await serviceAdmin.rpc('crm_claim_portal_removal_jobs', {
    p_agency_id: agencyId,
    p_transaction_id: options.transactionId || null,
    p_job_id: options.jobId || null,
    p_limit: Math.max(1, Math.min(options.limit || 5, 20)),
  });
  if (error) throw new Error(error.message);
  const jobs = (data || []) as ClaimedRemoval[];
  const deliveries: RemovalDelivery[] = [];

  for (const job of jobs) {
    try {
      if (job.portal !== 'storia') {
        deliveries.push(await finish(
          serviceAdmin, agencyId, job, false,
          `Portalul ${job.portal} nu are integrare verificată pentru retragere automată.`,
        ));
        continue;
      }
      if (!job.external_id) {
        deliveries.push(await finish(serviceAdmin, agencyId, job, false, 'ID-ul public Storia lipsește.'));
        continue;
      }
      const token = await getValidToken(serviceAdmin, agencyId);
      if (!token) {
        deliveries.push(await finish(serviceAdmin, agencyId, job, false, 'Contul Storia nu este conectat.'));
        continue;
      }
      const response = await olxFetch(`/advert/v1/${encodeURIComponent(job.external_id)}`, token, { method: 'DELETE' });
      if (response.ok || response.status === 404) {
        deliveries.push(await finish(serviceAdmin, agencyId, job, true));
        continue;
      }
      const responseBody = await response.text().catch(() => '');
      deliveries.push(await finish(
        serviceAdmin, agencyId, job, false,
        `Storia HTTP ${response.status}: ${responseBody}`,
      ));
    } catch (caught) {
      deliveries.push(await finish(serviceAdmin, agencyId, job, false, caught));
    }
  }
  return deliveries;
}
