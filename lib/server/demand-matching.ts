import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { isPropertySearchIntent } from '@/lib/demand-record';
import { normalizeMatchKey, scoreMatch } from '@/lib/match-score';

const MIN_ALERT_SCORE = 40;

export async function refreshMatchesForDemand(
  serviceAdmin: SupabaseClient,
  agencyId: string,
  demandId: string,
): Promise<{ evaluated: number; matched: number }> {
  const { data: demand, error: demandError } = await serviceAdmin.from('demands')
    .select('*').eq('id', demandId).eq('agency_id', agencyId).is('deleted_at', null).maybeSingle();
  if (demandError) throw demandError;
  if (!demand) throw new Error('Cererea pentru matching nu există în agenție');
  if (!isPropertySearchIntent(demand.intent) || demand.status !== 'activa') {
    return { evaluated: 0, matched: 0 };
  }

  const propertyTypes = demand.property_types?.length
    ? demand.property_types
    : [demand.category].filter(Boolean);
  let query = serviceAdmin.from('properties')
    .select('id, internal_code, title, city, county, zone, price, currency, category, transaction, latitude, longitude, surface_useful, surface_land, attributes, status')
    .eq('agency_id', agencyId).eq('status', 'activa').eq('transaction', demand.transaction)
    .is('deleted_at', null).limit(500);
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
  if (propertyError) throw propertyError;
  const evaluated = (properties || []).map((property) => ({
    property,
    result: scoreMatch(property, demand),
  }));
  const accepted = evaluated
    .filter(({ result }) => result.eligible && result.score >= 30)
    .sort((a, b) => b.result.score - a.result.score || b.result.coverage - a.result.coverage)
    .slice(0, 50);
  const now = new Date().toISOString();

  const { data: existing } = await serviceAdmin.from('matches')
    .select('id, property_id, status, agent_confirmed_at, agent_confirmed_by')
    .eq('agency_id', agencyId).eq('demand_id', demandId);
  const existingByProperty = new Map((existing || []).map((row) => [row.property_id, row]));
  if (accepted.length > 0) {
    const { error } = await serviceAdmin.from('matches').upsert(accepted.map(({ property, result }) => ({
      agency_id: agencyId,
      demand_id: demandId,
      property_id: property.id,
      score: result.score,
      coverage: result.coverage,
      details: {
        explanations: result.explanations,
        matched: result.matched,
        unmatched: result.unmatched,
        unknown: result.unknown,
        reason: result.reason,
      },
      price_difference: result.price_difference,
      score_version: result.score_version,
      evaluated_at: now,
      requires_agent_confirmation: true,
      status: existingByProperty.get(property.id)?.status || 'noua',
      agent_confirmed_at: existingByProperty.get(property.id)?.agent_confirmed_at || null,
      agent_confirmed_by: existingByProperty.get(property.id)?.agent_confirmed_by || null,
    })), { onConflict: 'agency_id,demand_id,property_id', ignoreDuplicates: false, defaultToNull: false });
    if (error) throw error;
  }

  const acceptedIds = new Set(accepted.map(({ property }) => property.id));
  const expiredIds = (existing || [])
    .filter((row) => ['noua', 'revizuita', 'aprobata'].includes(row.status) && !acceptedIds.has(row.property_id))
    .map((row) => row.id);
  if (expiredIds.length > 0) {
    await serviceAdmin.from('matches').update({ status: 'expirata', evaluated_at: now })
      .eq('agency_id', agencyId).in('id', expiredIds);
  }
  return { evaluated: evaluated.length, matched: accepted.length };
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  if (error && typeof error === 'object' && 'message' in error) return String(error.message).slice(0, 500);
  return String(error || 'Eroare necunoscută').slice(0, 500);
}

export async function refreshDemandMatchesForProperty(
  serviceAdmin: SupabaseClient,
  agencyId: string,
  propertyId: string,
): Promise<{ evaluated: number; matched: number }> {
  const { data: property, error: propertyError } = await serviceAdmin
    .from('properties')
    .select('id, agency_id, status, deleted_at, category, transaction, city, county, zone, price, currency, latitude, longitude, surface_useful, surface_land, attributes')
    .eq('id', propertyId)
    .eq('agency_id', agencyId)
    .maybeSingle();
  if (propertyError) throw propertyError;
  if (!property) throw new Error('Proprietatea pentru matching nu există în agenție');

  if (property.deleted_at || property.status !== 'activa') {
    await serviceAdmin.from('matches')
      .update({ status: 'expirata', evaluated_at: new Date().toISOString() })
      .eq('agency_id', agencyId)
      .eq('property_id', propertyId)
      .in('status', ['noua', 'revizuita', 'aprobata']);
    await serviceAdmin.from('demand_match_refresh_queue')
      .update({ status: 'processed', processed_at: new Date().toISOString(), last_error: null })
      .eq('agency_id', agencyId).eq('property_id', propertyId).eq('status', 'pending');
    return { evaluated: 0, matched: 0 };
  }

  let query = serviceAdmin
    .from('demands')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('status', 'activa')
    .eq('transaction', property.transaction)
    .contains('property_types', [property.category])
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .range(0, 999);

  if (typeof property.price === 'number' && property.price > 0) {
    // Broad prefilter only. The explainable scorer performs the exact check and
    // still admits near-budget recommendations.
    query = query
      .or(`budget_unknown.eq.true,budget_max.is.null,budget_max.gte.${Math.floor(property.price * 0.8)}`)
      .or(`budget_unknown.eq.true,budget_min.is.null,budget_min.lte.${Math.ceil(property.price * 1.2)}`);
  }

  const { data: demands, error: demandError } = await query;
  if (demandError) throw demandError;

  const evaluated = (demands || [])
    .filter((demand) => isPropertySearchIntent(demand.intent))
    .map((demand) => ({ demand, result: scoreMatch(property, demand) }));
  const accepted = evaluated
    .filter(({ result }) => result.eligible && result.score >= MIN_ALERT_SCORE)
    .sort((a, b) => b.result.score - a.result.score || b.result.coverage - a.result.coverage)
    .slice(0, 50);
  const now = new Date().toISOString();
  const { data: existing } = await serviceAdmin.from('matches')
    .select('id, demand_id, status, agent_confirmed_at, agent_confirmed_by')
    .eq('agency_id', agencyId)
    .eq('property_id', propertyId);
  const existingByDemand = new Map((existing || []).map((row) => [row.demand_id, row]));

  if (accepted.length > 0) {
    const { error: upsertError } = await serviceAdmin.from('matches').upsert(
      accepted.map(({ demand, result }) => ({
        agency_id: agencyId,
        demand_id: demand.id,
        property_id: propertyId,
        score: result.score,
        coverage: result.coverage,
        details: {
          explanations: result.explanations,
          matched: result.matched,
          unmatched: result.unmatched,
          unknown: result.unknown,
          reason: result.reason,
        },
        price_difference: result.price_difference,
        score_version: result.score_version,
        evaluated_at: now,
        requires_agent_confirmation: true,
        status: existingByDemand.get(demand.id)?.status || 'noua',
        agent_confirmed_at: existingByDemand.get(demand.id)?.agent_confirmed_at || null,
        agent_confirmed_by: existingByDemand.get(demand.id)?.agent_confirmed_by || null,
      })),
      { onConflict: 'agency_id,demand_id,property_id', ignoreDuplicates: false, defaultToNull: false },
    );
    if (upsertError) throw upsertError;
  }

  const acceptedIds = new Set(accepted.map(({ demand }) => demand.id));
  const expiredIds = (existing || [])
    .filter((row) => ['noua', 'revizuita', 'aprobata'].includes(row.status) && !acceptedIds.has(row.demand_id))
    .map((row) => row.id);
  if (expiredIds.length > 0) {
    await serviceAdmin.from('matches').update({ status: 'expirata', evaluated_at: now }).in('id', expiredIds).eq('agency_id', agencyId);
  }

  await serviceAdmin.from('demand_match_refresh_queue')
    .update({ status: 'processed', processed_at: now, last_error: null })
    .eq('agency_id', agencyId).eq('property_id', propertyId).eq('status', 'pending');

  return { evaluated: evaluated.length, matched: accepted.length };
}

export async function processPendingDemandMatchJobs(
  serviceAdmin: SupabaseClient,
  agencyId: string,
  limit = 3,
): Promise<void> {
  const { data: jobs } = await serviceAdmin.from('demand_match_refresh_queue')
    .select('id, property_id, attempts')
    .eq('agency_id', agencyId)
    .eq('status', 'pending')
    .lt('attempts', 5)
    .order('created_at', { ascending: true })
    .limit(Math.max(1, Math.min(limit, 10)));

  for (const job of jobs || []) {
    await serviceAdmin.from('demand_match_refresh_queue')
      .update({ attempts: Number(job.attempts || 0) + 1 })
      .eq('id', job.id).eq('agency_id', agencyId).eq('status', 'pending');
    try {
      await refreshDemandMatchesForProperty(serviceAdmin, agencyId, job.property_id);
    } catch (error) {
      await serviceAdmin.from('demand_match_refresh_queue')
        .update({ last_error: errorMessage(error) })
        .eq('id', job.id).eq('agency_id', agencyId).eq('status', 'pending');
    }
  }
}
