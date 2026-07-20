export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'team', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;

    const [
      { count: totalMembers },
      { data: allProps },
      { count: clientsTotal },
    ] = await Promise.all([
      admin.from('profiles').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId),
      admin.from('properties').select('agent_id, status').eq('agency_id', agencyId).is('deleted_at', null),
      admin.from('leads').select('id', { count: 'exact', head: true }).eq('agency_id', agencyId).is('deleted_at', null),
    ]);

    const SOLD_STATUSES = new Set(['tranzactionata', 'vanduta_noi', 'vanduta_altii', 'inchiriata']);
    const props = allProps || [];
    const activeProps = props.filter((p) => p.status === 'activa').length;
    const soldProps = props.filter((p) => SOLD_STATUSES.has(p.status)).length;

    const agentMap: Record<string, number> = {};
    props.forEach((p) => {
      if (p.agent_id) agentMap[p.agent_id] = (agentMap[p.agent_id] || 0) + 1;
    });
    const agentCounts = Object.values(agentMap);
    const avgProps = agentCounts.length ? Math.round(agentCounts.reduce((a, b) => a + b, 0) / agentCounts.length) : 0;

    return Response.json({
      total_members: totalMembers || 0,
      active_properties: activeProps,
      sold_properties: soldProps,
      total_clients: clientsTotal || 0,
      avg_properties_per_agent: avgProps,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
