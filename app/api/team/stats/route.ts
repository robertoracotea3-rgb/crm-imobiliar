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

    const [
      { count: totalMembers },
      { data: allProps },
      { count: demandsTotal },
    ] = await Promise.all([
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('agency_id', profile.agency_id),
      admin.from('properties').select('agent_id, status').eq('agency_id', profile.agency_id),
      admin.from('demands').select('id', { count: 'exact', head: true }).eq('agency_id', profile.agency_id),
    ]);

    const SOLD_STATUSES = new Set(['tranzactionata', 'vanduta_noi', 'vanduta_altii', 'inchiriata']);
    const props = allProps || [];
    const activeProps = props.filter(p => p.status === 'activa').length;
    const soldProps = props.filter(p => SOLD_STATUSES.has(p.status)).length;

    const agentMap: Record<string, number> = {};
    props.forEach(p => {
      if (p.agent_id) agentMap[p.agent_id] = (agentMap[p.agent_id] || 0) + 1;
    });
    const agentCounts = Object.values(agentMap);
    const avgProps = agentCounts.length ? Math.round(agentCounts.reduce((a, b) => a + b, 0) / agentCounts.length) : 0;

    return Response.json({
      total_members: totalMembers || 0,
      active_properties: activeProps,
      sold_properties: soldProps,
      total_demands: demandsTotal || 0,
      avg_properties_per_agent: avgProps,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
