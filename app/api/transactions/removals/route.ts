export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';
import { appendAuditEvent } from '@/lib/server/audit-log';
import { processPortalRemovalJobs } from '@/lib/server/portal-removals';
import { createPageWindow, paginationMetadata } from '@/lib/pagination';

const MAX_PAGE_SIZE = 50;

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'transactions', action: 'view' });
  if (!auth.ok) return auth.response;
  const { admin, agencyId } = auth.context;
  const params = new URL(request.url).searchParams;
  const pageWindow = createPageWindow(params.get('page'), params.get('page_size'), {
    maxPageSize: MAX_PAGE_SIZE,
  });
  const { from, to } = pageWindow;
  let query = admin.from('portal_removal_jobs').select(
    'id,transaction_id,property_id,portal,external_id,status,attempts,max_attempts,next_attempt_at,last_error,requested_at,confirmed_at',
    { count: 'exact' },
  ).eq('agency_id', agencyId);
  const transactionId = params.get('transaction_id');
  if (transactionId) query = query.eq('transaction_id', transactionId);
  const status = params.get('status');
  if (status) query = query.eq('status', status);
  const { data, error, count } = await query.order('requested_at', { ascending: false })
    .range(from, to);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({
    jobs: data || [],
    pagination: paginationMetadata(count, pageWindow),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'transactions', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { admin, serviceAdmin, agencyId, user, role } = auth.context;
  try {
    const body = await request.json().catch(() => ({}));
    const transactionId = typeof body.transaction_id === 'string' ? body.transaction_id : null;
    const jobId = typeof body.job_id === 'string' ? body.job_id : null;
    if (transactionId) {
      const { data } = await admin.from('transactions').select('id').eq('id', transactionId)
        .eq('agency_id', agencyId).is('deleted_at', null).maybeSingle();
      if (!data) return Response.json({ error: 'Tranzacția nu este accesibilă.' }, { status: 404 });
    }
    if (jobId) {
      const { data } = await admin.from('portal_removal_jobs').select('id,status,attempts,max_attempts').eq('id', jobId)
        .eq('agency_id', agencyId).maybeSingle();
      if (!data) return Response.json({ error: 'Jobul nu este accesibil.' }, { status: 404 });
      if (['retry', 'failed'].includes(data.status)) {
        const { error: retryError } = await serviceAdmin.from('portal_removal_jobs').update({
          status: 'retry',
          next_attempt_at: new Date().toISOString(),
          max_attempts: Math.min(20, Math.max(data.max_attempts, data.attempts + 1)),
          updated_at: new Date().toISOString(),
        }).eq('id', jobId).eq('agency_id', agencyId);
        if (retryError) return Response.json({ error: retryError.message }, { status: 500 });
      }
    }
    const deliveries = await processPortalRemovalJobs(serviceAdmin, agencyId, {
      transactionId, jobId, limit: transactionId || jobId ? 20 : 5,
    });
    await appendAuditEvent({
      client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: role,
      action: jobId ? 'portal.removal_retried' : 'portal.removal_processed',
      entityType: jobId ? 'portal_removal_job' : 'transaction',
      entityId: jobId || transactionId,
      result: deliveries.some(delivery => delivery.status !== 'confirmed') ? 'failure' : 'success',
      after: {
        deliveries: deliveries.map(delivery => ({
          id: delivery.id,
          portal: delivery.portal,
          status: delivery.status,
        })),
      },
      metadata: { delivery_count: deliveries.length },
    });
    return Response.json({ deliveries });
  } catch (caught) {
    return Response.json({ error: caught instanceof Error ? caught.message : 'Eroare necunoscută' }, { status: 500 });
  }
}
