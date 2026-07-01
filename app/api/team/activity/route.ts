export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const { data: profiles } = await admin.from('profiles').select('user_id, full_name, role').eq('agency_id', profile.agency_id);
    const memberMap: Record<string, { full_name: string; role: string }> = {};
    (profiles || []).forEach(p => { memberMap[p.user_id] = { full_name: p.full_name || 'Agent', role: p.role }; });

    const [{ data: recentProps }, { data: recentClients }] = await Promise.all([
      admin.from('properties')
        .select('id, internal_code, title, agent_id, created_at, updated_at, status, category')
        .eq('agency_id', profile.agency_id)
        .order('created_at', { ascending: false })
        .limit(30),
      admin.from('leads')
        .select('id, contact_name, agent_id, received_at, category, status')
        .eq('agency_id', profile.agency_id)
        .order('received_at', { ascending: false })
        .limit(20),
    ]);

    const events: unknown[] = [];

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

    events.sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return Response.json({ events: events.slice(0, 50) });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
