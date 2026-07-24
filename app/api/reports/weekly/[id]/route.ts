export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, { module: 'reports', action: 'view' });
  if (!auth.ok) return auth.response;
  const { id } = await context.params;
  if (!UUID.test(id)) return Response.json({ error: 'Raport invalid.' }, { status: 400 });
  const { data, error } = await auth.context.serviceAdmin.from('weekly_reports')
    .select('*')
    .eq('id', id)
    .eq('agency_id', auth.context.agencyId)
    .maybeSingle();
  if (error || !data) return Response.json({ error: 'Raportul nu a fost găsit.' }, { status: 404 });
  return Response.json({ report: data }, { headers: { 'Cache-Control': 'no-store' } });
}
