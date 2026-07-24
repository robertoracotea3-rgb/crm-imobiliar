export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

const PERIODS = ['7d', '30d', '90d', 'month', 'year'] as const;
type Period = typeof PERIODS[number];

function periodStart(period: Period, now: Date): Date {
  if (period === 'month') return new Date(now.getFullYear(), now.getMonth(), 1);
  if (period === 'year') return new Date(now.getFullYear(), 0, 1);
  const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
  return new Date(now.getTime() - days * 86_400_000);
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'dashboard', action: 'view' });
  if (!auth.ok) return auth.response;

  const { serviceAdmin, agencyId, user, role } = auth.context;
  const requested = new URL(request.url).searchParams.get('period') as Period | null;
  const period: Period = requested && PERIODS.includes(requested) ? requested : '30d';
  const now = new Date();
  const from = periodStart(period, now);
  const managementView = ['owner', 'admin', 'manager'].includes(role);

  const [
    { data: profile, error: profileError },
    { data: metrics, error: metricsError },
    { data: contactSla, error: contactSlaError },
    { data: missingContactDescription, error: missingContactDescriptionError },
    { data: notifications },
  ] =
    await Promise.all([
      serviceAdmin.from('profiles').select('full_name').eq('agency_id', agencyId)
        .eq('user_id', user.id).maybeSingle(),
      serviceAdmin.rpc('crm_dashboard_kpis', {
        p_agency_id: agencyId,
        p_user_id: user.id,
        p_scope_all: managementView,
        p_from: from.toISOString(),
        p_to: now.toISOString(),
      }),
      serviceAdmin.rpc('crm_contact_sla_dashboard', {
        p_agency_id: agencyId,
        p_user_id: user.id,
        p_scope_all: managementView,
        p_from: from.toISOString(),
        p_to: now.toISOString(),
      }),
      serviceAdmin.rpc('crm_missing_contact_description_count', {
        p_agency_id: agencyId,
        p_user_id: user.id,
        p_scope_all: managementView,
      }),
      serviceAdmin.from('notifications')
        .select('id,type,title,message,priority,action_url,read_at,created_at')
        .eq('agency_id', agencyId).eq('user_id', user.id).is('dismissed_at', null)
        .order('created_at', { ascending: false }).limit(8),
    ]);

  if (profileError) return Response.json({ error: profileError.message }, { status: 500 });
  if (metricsError) {
    if (/crm_dashboard_kpis|does not exist|schema cache/i.test(metricsError.message)) {
      return Response.json({ error: 'Migrarea KPI pentru dashboard nu este instalată.' }, { status: 503 });
    }
    return Response.json({ error: metricsError.message }, { status: 500 });
  }
  if (contactSlaError) {
    if (/crm_contact_sla_dashboard|does not exist|schema cache/i.test(contactSlaError.message)) {
      return Response.json({ error: 'Migrarea SLA de contact nu este instalată.' }, { status: 503 });
    }
    return Response.json({ error: contactSlaError.message }, { status: 500 });
  }
  if (missingContactDescriptionError) {
    if (/crm_missing_contact_description_count|does not exist|schema cache/i.test(missingContactDescriptionError.message)) {
      return Response.json({ error: 'Migrarea interacțiunilor de contact nu este instalată.' }, { status: 503 });
    }
    return Response.json({ error: missingContactDescriptionError.message }, { status: 500 });
  }

  type AgentMetric = {
    user_id: string;
    name?: string;
    role?: string;
    leads?: number;
    viewings?: number;
    transactions?: number;
    average_response_minutes?: number;
    conversion_rate?: number;
    assigned?: number;
    contacted_on_time?: number;
    contacted_late?: number;
    uncontacted?: number;
    average_first_contact_minutes?: number;
    sla_percent?: number;
  };
  const baseAgents = (metrics?.agent_performance || []) as AgentMetric[];
  const slaAgents = (contactSla?.agents || []) as AgentMetric[];
  const baseByAgent = new Map(baseAgents.map((agent) => [agent.user_id, agent]));
  const slaByAgent = new Map(slaAgents.map((agent) => [agent.user_id, agent]));
  const agentIds = [...new Set([
    ...baseAgents.map((agent) => agent.user_id),
    ...slaAgents.map((agent) => agent.user_id),
  ])];
  const agentPerformance = agentIds.map((userId) => ({
    ...(baseByAgent.get(userId) || {
      user_id: userId,
      leads: 0,
      viewings: 0,
      transactions: 0,
      average_response_minutes: 0,
      conversion_rate: 0,
    }),
    ...(slaByAgent.get(userId) || {
      assigned: 0,
      contacted_on_time: 0,
      contacted_late: 0,
      uncontacted: 0,
      average_first_contact_minutes: 0,
      sla_percent: 0,
    }),
  }));

  return Response.json({
    user: { name: profile?.full_name || user.email || 'Utilizator', role },
    period,
    generated_at: now.toISOString(),
    ...metrics,
    agent_performance: agentPerformance,
    contact_sla: {
      ...(contactSla?.overall || {}),
      missing_description: Number(missingContactDescription || 0),
    },
    notifications: notifications || [],
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
