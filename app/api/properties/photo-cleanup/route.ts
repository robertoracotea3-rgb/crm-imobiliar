export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';
import { processPropertyMediaCleanupJobs } from '@/lib/server/property-media-cleanup';

const pageValue = (value: string | null, fallback: number, max: number) => {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? Math.min(number, max) : fallback;
};

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'properties', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { admin, agencyId } = auth.context;
  const params = new URL(request.url).searchParams;
  const page = pageValue(params.get('page'), 1, 100_000);
  const pageSize = pageValue(params.get('page_size'), 25, 50);
  const from = (page - 1) * pageSize;
  let query = admin.from('property_media_cleanup_jobs').select(
    'id,property_id,storage_path,reason,status,attempts,max_attempts,next_attempt_at,last_error,requested_at,confirmed_at',
    { count: 'exact' },
  ).eq('agency_id', agencyId);
  if (params.get('property_id')) query = query.eq('property_id', params.get('property_id'));
  if (params.get('status')) query = query.eq('status', params.get('status'));
  const { data, error, count } = await query.order('requested_at', { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  const total = count || 0;
  return Response.json({
    jobs: data || [],
    pagination: { page, page_size: pageSize, total, pages: Math.ceil(total / pageSize) },
  });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'properties', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin, agencyId } = auth.context;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.job_id === 'string') {
      const { data: job } = await serviceAdmin.from('property_media_cleanup_jobs')
        .select('id,status,attempts,max_attempts').eq('id', body.job_id)
        .eq('agency_id', agencyId).maybeSingle();
      if (!job) return Response.json({ error: 'Operația de curățare nu există.' }, { status: 404 });
      if (['retry', 'failed'].includes(job.status)) {
        await serviceAdmin.from('property_media_cleanup_jobs').update({
          status: 'retry',
          next_attempt_at: new Date().toISOString(),
          max_attempts: Math.min(20, Math.max(job.max_attempts, job.attempts + 1)),
          updated_at: new Date().toISOString(),
        }).eq('id', job.id).eq('agency_id', agencyId);
      }
    }
    const results = await processPropertyMediaCleanupJobs(serviceAdmin, agencyId, body.job_id ? 1 : 10);
    return Response.json({ results });
  } catch (caught) {
    return Response.json({
      error: caught instanceof Error ? caught.message : 'Curățarea fotografiilor a eșuat.',
    }, { status: 500 });
  }
}
