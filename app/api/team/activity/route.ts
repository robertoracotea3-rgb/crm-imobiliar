export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'team', action: 'view' });
  if (!auth.ok) return auth.response;
  try {
    const { admin, agencyId } = auth.context;

    const { data: profiles } = await admin.from('profiles').select('user_id, full_name, role').eq('agency_id', agencyId);
    const memberMap: Record<string, { full_name: string; role: string }> = {};
    (profiles || []).forEach(p => { memberMap[p.user_id] = { full_name: p.full_name || 'Agent', role: p.role }; });

    const [{ data: recentProps }, { data: recentClients }] = await Promise.all([
      admin.from('properties')
        .select('id, internal_code, title, agent_id, created_at, updated_at, status, category')
        .eq('agency_id', agencyId)
        .order('created_at', { ascending: false })
        .limit(30),
      admin.from('leads')
        .select('id, contact_name, agent_id, received_at, category, status')
        .eq('agency_id', agencyId)
        .order('received_at', { ascending: false })
        .limit(20),
    ]);

    const events: ({ created_at: string } & Record<string, unknown>)[] = [];

    (recentProps || []).forEach(p => {
      events.push({
        id: `prop-${p.id}`,
        type: 'property',
        action: 'create',
        label: `Proprietate adaugata: ${p.title || p.internal_code}`,
        entity_id: p.id,
        entity_code: p.internal_code,
        user_id: p.agent_id,
        agent_name: memberMap[p.agent_id]?.full_name || 'Necunoscut',
        created_at: p.created_at,
        meta: { category: p.category, status: p.status },
      });
    });

    (recentClients || []).forEach(l => {
      events.push({
        id: `client-${l.id}`,
        type: 'client',
        action: 'create',
        label: `Client nou: ${l.contact_name || 'fără nume'}`,
        entity_id: l.id,
        entity_code: '',
        user_id: l.agent_id,
        agent_name: memberMap[l.agent_id]?.full_name || 'Necunoscut',
        created_at: l.received_at,
        meta: { category: l.category, status: l.status },
      });
    });

    events.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return Response.json({ events: events.slice(0, 50) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
