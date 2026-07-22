export const dynamic = 'force-dynamic';

import { scoreMatch } from '@/lib/match-score';
import { requireApiAuth } from '@/lib/server/api-auth';

// Compatibility endpoint for the client-card action. Canonical criteria come
// from the client's active demand; lead fields are only a controlled fallback.
export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'leads', action: 'view' });
  if (!auth.ok) return auth.response;
  try {
    const { admin, agencyId } = auth.context;
    const clientId = new URL(request.url).searchParams.get('client_id');
    if (!clientId) return Response.json({ error: 'client_id lipsește' }, { status: 400 });
    const { data: lead } = await admin.from('leads').select('*')
      .eq('id', clientId).eq('agency_id', agencyId).is('deleted_at', null).maybeSingle();
    if (!lead) return Response.json({ error: 'Clientul nu a fost găsit' }, { status: 404 });

    const { data: demands } = lead.contact_id
      ? await admin.from('demands').select('*').eq('agency_id', agencyId).eq('contact_id', lead.contact_id)
        .eq('status', 'activa').is('deleted_at', null).order('updated_at', { ascending: false }).limit(1)
      : { data: [] };
    const demand = demands?.[0] || {
      category: lead.category,
      property_types: lead.category ? [lead.category] : [],
      transaction: lead.transaction,
      budget_min: lead.budget_min,
      budget_max: lead.budget_max,
      budget_unknown: lead.budget_min == null && lead.budget_max == null,
      currency: lead.currency,
      cities: lead.city ? [lead.city] : [],
      counties: lead.county ? [lead.county] : [],
      criteria: lead.criteria || {},
    };

    let propertyQuery = admin.from('properties')
      .select('id, internal_code, title, city, county, zone, price, currency, category, transaction, latitude, longitude, surface_useful, surface_land, attributes, status')
      .eq('agency_id', agencyId).eq('status', 'activa').is('deleted_at', null).limit(500);
    const propertyTypes = demand.property_types?.length ? demand.property_types : [demand.category].filter(Boolean);
    if (propertyTypes.length > 0) propertyQuery = propertyQuery.in('category', propertyTypes);
    if (demand.transaction) propertyQuery = propertyQuery.eq('transaction', demand.transaction);
    const { data: properties } = await propertyQuery;
    const matches = (properties || []).map((property) => ({ ...property, ...scoreMatch(property, demand) }))
      .filter((property) => property.eligible && property.score >= 30)
      .sort((a, b) => b.score - a.score).slice(0, 20);
    return Response.json({ matches, demand_id: demands?.[0]?.id || null, used_legacy_lead_criteria: !demands?.[0] });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Eroare' }, { status: 500 });
  }
}
