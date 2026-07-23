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

  const [{ data: profile, error: profileError }, { data: metrics, error: metricsError }, { data: notifications }] =
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

  return Response.json({
    user: { name: profile?.full_name || user.email || 'Utilizator', role },
    period,
    generated_at: now.toISOString(),
    ...metrics,
    notifications: notifications || [],
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
