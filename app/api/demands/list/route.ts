export const dynamic = 'force-dynamic';

import { DEMAND_INTENTS, DEMAND_PROPERTY_TYPES } from '@/lib/demand-record';
import { normalizeMatchKey } from '@/lib/match-score';
import { requireApiAuth } from '@/lib/server/api-auth';

function positiveInteger(value: string | null, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function safeSearch(value: string | null): string {
  return String(value || '').trim().replace(/[%_,().]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'demands', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId, user } = auth.context;
    const params = new URL(request.url).searchParams;
    const page = positiveInteger(params.get('page'), 1, 10000);
    const pageSize = positiveInteger(params.get('page_size'), 25, 100);
    const status = params.get('status');
    const intent = params.get('intent');
    const propertyType = params.get('property_type');
    const cityKey = normalizeMatchKey(params.get('city'));
    const contactId = params.get('contact_id');
    const demandId = params.get('demand_id');
    const agentId = params.get('agent_id');
    const search = safeSearch(params.get('search'));

    let query = admin.from('demands')
      .select('*', { count: 'exact' })
      .eq('agency_id', agencyId)
      .is('deleted_at', null);
    if (status && status !== 'all') query = query.eq('status', status);
    if (intent && DEMAND_INTENTS.includes(intent as typeof DEMAND_INTENTS[number])) query = query.eq('intent', intent);
    if (propertyType && DEMAND_PROPERTY_TYPES.includes(propertyType as typeof DEMAND_PROPERTY_TYPES[number])) {
      query = query.contains('property_types', [propertyType]);
    }
    if (cityKey) query = query.contains('city_match_keys', [cityKey]);
    if (contactId) query = query.eq('contact_id', contactId);
    if (demandId) query = query.eq('id', demandId);
    if (agentId === 'mine') query = query.eq('agent_id', user.id);
    else if (agentId) query = query.eq('agent_id', agentId);
    if (search) query = query.or(`internal_code.ilike.%${search}%,notes.ilike.%${search}%,special_requirements.ilike.%${search}%`);

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query.order('created_at', { ascending: false }).range(from, from + pageSize - 1);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    const contactIds = [...new Set((data || []).map((demand) => demand.contact_id).filter(Boolean))];
    const { data: contacts } = contactIds.length > 0
      ? await admin.from('contacts').select('id, full_name, phone, email').eq('agency_id', agencyId).in('id', contactIds)
      : { data: [] as Array<{ id: string; full_name: string; phone?: string; email?: string }> };
    const contactMap = new Map((contacts || []).map((contact) => [contact.id, contact]));
    const demands = (data || []).map((demand) => ({ ...demand, contact: contactMap.get(demand.contact_id) || null }));
    const total = count || 0;

    return Response.json({
      demands,
      pagination: {
        page,
        page_size: pageSize,
        total,
        total_pages: Math.max(1, Math.ceil(total / pageSize)),
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Eroare' }, { status: 500 });
  }
}
