import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  PROPERTY_PHOTO_BUCKET,
  mediaFolderForCleanup,
  nextPropertyMediaCleanupAttempt,
} from '@/lib/property-media';

interface CleanupJob {
  id: string;
  property_id: string;
  photo_id: string | null;
  storage_path: string;
  attempts: number;
  max_attempts: number;
}

export interface PropertyMediaCleanupResult {
  id: string;
  status: 'confirmed' | 'retry' | 'failed';
  error?: string;
}

const safeError = (error: unknown) =>
  (error instanceof Error ? error.message : String(error || 'Eroare necunoscută'))
    .replace(/Bearer\s+\S+/gi, 'Bearer [redacted]')
    .slice(0, 500);

async function finish(
  serviceAdmin: SupabaseClient,
  agencyId: string,
  job: CleanupJob,
  success: boolean,
  error?: unknown,
): Promise<PropertyMediaCleanupResult> {
  const cleanedError = success ? null : safeError(error);
  const { data, error: rpcError } = await serviceAdmin.rpc('crm_finish_property_media_cleanup', {
    p_agency_id: agencyId,
    p_job_id: job.id,
    p_success: success,
    p_error: cleanedError,
    p_retry_at: success ? null : nextPropertyMediaCleanupAttempt(job.attempts),
  });
  if (rpcError) throw new Error(rpcError.message);
  return {
    id: job.id,
    status: String(data) as PropertyMediaCleanupResult['status'],
    ...(cleanedError ? { error: cleanedError } : {}),
  };
}

export async function processPropertyMediaCleanupJobs(
  serviceAdmin: SupabaseClient,
  agencyId: string,
  limit = 10,
): Promise<PropertyMediaCleanupResult[]> {
  const { data, error } = await serviceAdmin.rpc('crm_claim_property_media_cleanup', {
    p_agency_id: agencyId,
    p_limit: Math.max(1, Math.min(limit, 50)),
  });
  if (error) throw new Error(error.message);
  const results: PropertyMediaCleanupResult[] = [];

  for (const job of (data || []) as CleanupJob[]) {
    try {
      const folder = mediaFolderForCleanup(job.storage_path);
      let paths: string[];
      if (folder === job.storage_path) {
        paths = [job.storage_path];
      } else {
        const { data: files, error: listError } = await serviceAdmin.storage
          .from(PROPERTY_PHOTO_BUCKET)
          .list(folder, { limit: 100 });
        if (listError) throw new Error(listError.message);
        paths = (files || []).filter((file) => file.name).map((file) => `${folder}/${file.name}`);
      }
      if (paths.length) {
        const { error: removeError } = await serviceAdmin.storage.from(PROPERTY_PHOTO_BUCKET).remove(paths);
        if (removeError) throw new Error(removeError.message);
      }
      results.push(await finish(serviceAdmin, agencyId, job, true));
    } catch (caught) {
      try {
        results.push(await finish(serviceAdmin, agencyId, job, false, caught));
      } catch (finishError) {
        results.push({ id: job.id, status: 'retry', error: safeError(finishError) });
      }
    }
  }
  return results;
}
