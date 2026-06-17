export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const SOLD_STATUSES = new Set(['tranzactionata', 'vanduta_noi', 'vanduta_altii', 'inchiriata']);

const num = (v: unknown): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};
const toEur = (amount: number, currency?: string) => (currency === 'RON' ? amount / 5 : amount);

function monthKey(d: string) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}`;
}

/** Potential agency commission (EUR) for an active property, from its commission attributes. */
function pipelineCommissionEur(p: any): number {
  const a = p.attributes || {};
  const price = num(p.price);
  let prop = num(a.comision_prop_val) || (num(a.comision_prop_pct) ? price * num(a.comision_prop_pct) / 100 : 0);
  let chir = num(a.comision_chir_val) || (num(a.comision_chir_pct) ? price * num(a.comision_chir_pct) / 100 : 0);
  if (prop === 0 && chir === 0 && num(a.comision) > 0) prop = price * num(a.comision) / 100;
  return toEur(prop + chir, a.currency || p.currency);
}

export async function GET(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });
    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) return Response.json({ error: 'Sesiune invalidă' }, { status: 401 });
    const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agenție negăsită' }, { status: 400 });
    const agencyId = profile.agency_id;

    const [txRes, propRes, profRes] = await Promise.all([
      admin.from('transactions')
        .select('id, agent_id, type, sale_price, currency, agency_commission, agent_commission, closed_at, created_at')
        .eq('agency_id', agencyId).limit(2000),
      admin.from('properties').select('id, status, price, currency, attributes').eq('agency_id', agencyId).limit(1000),
      admin.from('profiles').select('user_id, full_name').eq('agency_id', agencyId).limit(200),
    ]);

    const nameMap: Record<string, string> = Object.fromEntries((profRes.data || []).map(p => [p.user_id, p.full_name || 'Agent']));

    // transactions table may not be migrated yet
    let needsMigration = false;
    if (txRes.error && /relation|does not exist|schema cache/i.test(txRes.error.message)) needsMigration = true;
    const txs = (txRes.data || []) as any[];

    const now = new Date();
    const months: string[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    }
    const thisMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;

    let totalAgencyCommission = 0, totalAgentCommission = 0, transactionValue = 0, thisMonthAgency = 0;
    const byMonthMap: Record<string, number> = {};
    const byAgentMap: Record<string, { agency: number; agent: number; deals: number }> = {};

    for (const t of txs) {
      const cur = t.currency || 'EUR';
      const agencyComm = toEur(num(t.agency_commission), cur);
      const agentComm = toEur(num(t.agent_commission), cur);
      const value = toEur(num(t.sale_price), cur);
      totalAgencyCommission += agencyComm;
      totalAgentCommission += agentComm;
      transactionValue += value;
      const mk = monthKey(t.closed_at || t.created_at);
      byMonthMap[mk] = (byMonthMap[mk] || 0) + agencyComm;
      if (mk === thisMonth) thisMonthAgency += agencyComm;
      const aid = t.agent_id || 'unknown';
      if (!byAgentMap[aid]) byAgentMap[aid] = { agency: 0, agent: 0, deals: 0 };
      byAgentMap[aid].agency += agencyComm;
      byAgentMap[aid].agent += agentComm;
      byAgentMap[aid].deals += 1;
    }

    const byMonth = months.map(m => ({ month: m, count: Math.round(byMonthMap[m] || 0) }));
    const byAgent = Object.entries(byAgentMap)
      .map(([id, v]) => ({ agent_id: id, name: nameMap[id] || 'Agent', agency_commission: Math.round(v.agency), agent_commission: Math.round(v.agent), deals: v.deals }))
      .sort((a, b) => b.agency_commission - a.agency_commission);

    const activeProps = (propRes.data || []).filter(p => p.status === 'activa');
    const pipelineCommission = Math.round(activeProps.reduce((s, p) => s + pipelineCommissionEur(p), 0));

    return Response.json({
      currency: 'EUR',
      needs_migration: needsMigration,
      total_commission: Math.round(totalAgencyCommission),
      total_agent_commission: Math.round(totalAgentCommission),
      this_month_commission: Math.round(thisMonthAgency),
      transaction_value: Math.round(transactionValue),
      deals_count: txs.length,
      avg_commission: txs.length ? Math.round(totalAgencyCommission / txs.length) : 0,
      pipeline_commission: pipelineCommission,
      by_month: byMonth,
      by_agent: byAgent,
      months,
    });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
