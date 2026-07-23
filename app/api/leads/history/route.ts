export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'leads', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'id lipsa' }, { status: 400 });

    const { data: lead } = await admin
      .from('leads')
      .select('id, received_at')
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!lead) return Response.json({ error: 'Client negasit' }, { status: 404 });

    let events: { type: string; title?: string; description: string; created_at: string }[] = [];
    try {
      const { data } = await admin
        .from('activities')
        .select('type, title, description, created_at')
        .eq('agency_id', agencyId)
        .eq('lead_id', id)
        .order('created_at', { ascending: false });
      events = data || [];
    } catch {
      // Tabela activities poate lipsi in instalari vechi.
    }

    try {
      const { data: pipelineEvents } = await admin
        .from('lead_pipeline_events')
        .select('from_stage,to_stage,reason,note,source,created_at')
        .eq('agency_id', agencyId)
        .eq('lead_id', id)
        .order('created_at', { ascending: false });
      events = [
        ...events,
        ...(pipelineEvents || []).map((event) => ({
          type: 'pipeline_stage',
          title: 'Etapă pipeline',
          description: `${event.from_stage || 'Început'} → ${event.to_stage}${event.reason ? ` · ${event.reason}` : ''}${event.note ? ` · ${event.note}` : ''}`,
          created_at: event.created_at,
        })),
      ].sort((left, right) => new Date(right.created_at).getTime() - new Date(left.created_at).getTime());
    } catch {
      // Pipeline-ul este aditiv și poate lipsi până la aplicarea migrării fazei 18.
    }

    return Response.json({ events, received_at: lead.received_at });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
