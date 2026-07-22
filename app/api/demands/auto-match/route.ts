export const dynamic = 'force-dynamic';

import { isPropertySearchIntent } from '@/lib/demand-record';
import { normalizeMatchKey, scoreMatch } from '@/lib/match-score';
import { requireApiAuth } from '@/lib/server/api-auth';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'demands', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, serviceAdmin, agencyId } = auth.context;
    const demandId = new URL(request.url).searchParams.get('demand_id');
    if (!demandId) return Response.json({ error: 'demand_id lipsește' }, { status: 400 });

    const { data: demand, error: demandError } = await admin.from('demands').select('*')
      .eq('id', demandId).eq('agency_id', agencyId).is('deleted_at', null).maybeSingle();
    if (demandError) return Response.json({ error: demandError.message }, { status: 500 });
    if (!demand) return Response.json({ error: 'Cererea nu a fost găsită' }, { status: 404 });
    if (!isPropertySearchIntent(demand.intent)) {
      return Response.json({
        matches: [], demand,
        notice: 'Aceasta este o solicitare de vânzare/ofertare. Matchingul cu proprietăți este disponibil pentru cumpărare și închiriere.',
      });
    }

    const propertyTypes = demand.property_types?.length ? demand.property_types : [demand.category].filter(Boolean);
    let query = admin.from('properties')
      .select('id, internal_code, title, city, county, zone, price, currency, category, transaction, latitude, longitude, surface_useful, surface_land, attributes, status')
      .eq('agency_id', agencyId)
      .eq('status', 'activa')
      .eq('transaction', demand.transaction)
      .is('deleted_at', null)
      .limit(500);
    if (propertyTypes.length > 0) query = query.in('category', propertyTypes);

    const cityKeys = (demand.city_match_keys || []).map(normalizeMatchKey).filter(Boolean);
    const countyKeys = (demand.county_match_keys || []).map(normalizeMatchKey).filter(Boolean);
    if (cityKeys.length > 0) query = query.in('city_match_key', cityKeys);
    else if (countyKeys.length > 0) query = query.in('county_match_key', countyKeys);
    if (!demand.budget_unknown) {
      if (typeof demand.budget_min === 'number') query = query.gte('price', demand.budget_min * 0.8);
      if (typeof demand.budget_max === 'number') query = query.lte('price', demand.budget_max * 1.2);
    }

    const { data: properties, error: propertyError } = await query;
    if (propertyError) return Response.json({ error: propertyError.message }, { status: 500 });
    const matches = (properties || [])
      .map((property) => ({ ...property, ...scoreMatch(property, demand) }))
      .filter((property) => property.eligible && property.score >= 30)
      .sort((a, b) => b.score - a.score || b.coverage - a.coverage)
      .slice(0, 50);

    const now = new Date().toISOString();
    const { data: previousMatches } = matches.length > 0
      ? await serviceAdmin.from('matches').select('property_id, status, agent_confirmed_at, agent_confirmed_by')
        .eq('agency_id', agencyId).eq('demand_id', demand.id).in('property_id', matches.map((match) => match.id))
      : { data: [] as Array<{ property_id: string; status: string; agent_confirmed_at?: string | null; agent_confirmed_by?: string | null }> };
    const previousByProperty = new Map((previousMatches || []).map((match) => [match.property_id, match]));
    if (matches.length > 0) {
      await serviceAdmin.from('matches').upsert(matches.map((match) => ({
        agency_id: agencyId,
        demand_id: demand.id,
        property_id: match.id,
        score: match.score,
        coverage: match.coverage,
        details: {
          explanations: match.explanations,
          matched: match.matched,
          unmatched: match.unmatched,
          unknown: match.unknown,
          reason: match.reason,
        },
        price_difference: match.price_difference,
        score_version: match.score_version,
        evaluated_at: now,
        requires_agent_confirmation: true,
        status: previousByProperty.get(match.id)?.status || 'noua',
        agent_confirmed_at: previousByProperty.get(match.id)?.agent_confirmed_at || null,
        agent_confirmed_by: previousByProperty.get(match.id)?.agent_confirmed_by || null,
      })), { onConflict: 'agency_id,demand_id,property_id', ignoreDuplicates: false, defaultToNull: false });
    }

    const { data: storedMatches } = matches.length > 0
      ? await serviceAdmin.from('matches').select('id, property_id, status, agent_confirmed_at')
        .eq('agency_id', agencyId).eq('demand_id', demand.id).in('property_id', matches.map((match) => match.id))
      : { data: [] as Array<{ id: string; property_id: string; status: string; agent_confirmed_at?: string | null }> };
    const storedByProperty = new Map((storedMatches || []).map((match) => [match.property_id, match]));

    return Response.json({
      matches: matches.map((match) => ({
        ...match,
        match_id: storedByProperty.get(match.id)?.id || null,
        match_status: storedByProperty.get(match.id)?.status || 'noua',
        agent_confirmed_at: storedByProperty.get(match.id)?.agent_confirmed_at || null,
      })),
      demand,
      server_filtered: true,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Eroare' }, { status: 500 });
  }
}
