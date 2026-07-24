export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const METRIC = /^[a-z0-9_]{2,80}$/;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, { module: 'reports', action: 'view' });
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  const url = new URL(request.url);
  const metric = String(url.searchParams.get('metric') || '');
  const agentId = String(url.searchParams.get('agent_id') || '');
  const page = Math.max(1, Math.min(10_000, Number(url.searchParams.get('page')) || 1));
  const pageSize = 100;
  if (!UUID.test(id) || !METRIC.test(metric) || (agentId && !UUID.test(agentId))) {
    return Response.json({ error: 'Filtru de raport invalid.' }, { status: 400 });
  }
  const { data: report } = await auth.context.serviceAdmin.from('weekly_reports')
    .select('id').eq('id', id).eq('agency_id', auth.context.agencyId).maybeSingle();
  if (!report) return Response.json({ error: 'Raportul nu a fost găsit.' }, { status: 404 });
  let query = auth.context.serviceAdmin.from('weekly_report_records')
    .select('id,metric_code,entity_type,entity_id,agent_id,occurred_at,label,details', {
      count: 'exact',
    })
    .eq('report_id', id)
    .eq('agency_id', auth.context.agencyId)
    .eq('metric_code', metric);
  if (agentId) query = query.eq('agent_id', agentId);
  const from = (page - 1) * pageSize;
  const { data, error, count } = await query.order('occurred_at', { ascending: false })
    .range(from, from + pageSize - 1);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  return Response.json({
    records: data || [],
    pagination: {
      page,
      page_size: pageSize,
      total: count || 0,
      total_pages: Math.ceil((count || 0) / pageSize),
    },
  }, { headers: { 'Cache-Control': 'no-store' } });
}
