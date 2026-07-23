import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  fetchAdvertStatus,
  fetchAllAdvertStatuses,
  getValidToken,
  StoriaApiError,
  type StoriaAdvertCheck,
} from '@/lib/storia-api';

const PORTAL = 'storia';

interface PortalListingRow {
  id: string;
  agency_id: string;
  property_id: string;
  agent_id: string | null;
  external_id: string | null;
  portal_ad_id: string | null;
  advert_url: string | null;
  status: string;
}

interface SyncCounts {
  checked: number;
  active: number;
  changed: number;
  missing: number;
  errors: number;
  stale: number;
}

export interface StoriaSyncSummary extends SyncCounts {
  agency_id: string;
  run_id: string | null;
  status: 'completed' | 'partial' | 'failed' | 'skipped';
  error_code: string | null;
}

function errorCode(caught: unknown) {
  return caught instanceof StoriaApiError ? caught.code : 'metadata_sync_failed';
}

function errorMessage(code: string) {
  const messages: Record<string, string> = {
    token_unavailable: 'Conexiunea Storia nu are un token valid.',
    metadata_response_invalid: 'Storia a trimis un răspuns de status invalid.',
    metadata_pagination_loop: 'Paginarea statusurilor Storia a intrat într-o buclă.',
    metadata_pagination_url_invalid: 'Storia a trimis un URL de paginare invalid.',
    metadata_page_limit_exceeded: 'Sincronizarea Storia a depășit limita sigură de pagini.',
  };
  return messages[code] || 'Metadatele listării Storia nu au putut fi verificate.';
}

async function recordCheck(
  serviceAdmin: SupabaseClient,
  listing: PortalListingRow,
  runId: string | null,
  result: 'verified' | 'not_found' | 'error',
  check: StoriaAdvertCheck | null,
  checkedAt: string,
  durationMs: number,
  code: string | null = null,
  message: string | null = null,
) {
  const { data, error } = await serviceAdmin.rpc('crm_record_portal_listing_check', {
    p_agency_id: listing.agency_id,
    p_portal_listing_id: listing.id,
    p_sync_run_id: runId,
    p_checked_at: checkedAt,
    p_result: result,
    p_remote_status: check?.status || null,
    p_remote_exists: check?.exists ?? null,
    p_external_id: check?.externalId || listing.external_id,
    p_portal_ad_id: check?.portalAdId || listing.portal_ad_id,
    p_advert_url: check?.advertUrl || listing.advert_url,
    p_error_code: code || check?.errorCode || null,
    p_error_message: message || check?.reason || null,
    p_payload: check?.payload || { error_code: code },
    p_raw_response: check?.verified ? check.raw : null,
    p_duration_ms: durationMs,
    p_agent_id: listing.agent_id,
  });
  if (error) throw new Error('portal_listing_check_persist_failed');
  return data as {
    listing_id: string;
    status: string;
    changed: boolean;
    result: string;
    property_id: string;
  };
}

async function listingRows(serviceAdmin: SupabaseClient, agencyId: string) {
  const { data, error } = await serviceAdmin
    .from('portal_listings')
    .select('id,agency_id,property_id,agent_id,external_id,portal_ad_id,advert_url,status')
    .eq('agency_id', agencyId)
    .eq('portal', PORTAL)
    .neq('status', 'deleted')
    .order('last_checked_at', { ascending: true, nullsFirst: true })
    .limit(1000);
  if (error) throw new Error('portal_listing_query_failed');

  const rows = (data || []) as PortalListingRow[];
  const propertyIds = [...new Set(rows.map(row => row.property_id))];
  if (propertyIds.length) {
    const { data: properties } = await serviceAdmin
      .from('properties')
      .select('id,agent_id')
      .eq('agency_id', agencyId)
      .in('id', propertyIds);
    const agents = new Map(
      ((properties || []) as { id: string; agent_id: string | null }[])
        .map(property => [property.id, property.agent_id]),
    );
    for (const row of rows) row.agent_id = agents.get(row.property_id) || row.agent_id;
  }
  return rows;
}

async function finishRun(
  serviceAdmin: SupabaseClient,
  agencyId: string,
  runId: string,
  status: 'completed' | 'partial' | 'failed',
  counts: SyncCounts,
  code: string | null = null,
  message: string | null = null,
) {
  const { data, error } = await serviceAdmin.rpc('crm_finish_portal_sync_run', {
    p_agency_id: agencyId,
    p_run_id: runId,
    p_status: status,
    p_checked_count: counts.checked,
    p_active_count: counts.active,
    p_changed_count: counts.changed,
    p_missing_count: counts.missing,
    p_error_count: counts.errors,
    p_stale_count: counts.stale,
    p_error_code: code,
    p_error_message: message,
  });
  if (error || data !== true) throw new Error('portal_sync_finish_failed');
}

async function markStale(serviceAdmin: SupabaseClient, agencyId: string) {
  const { data, error } = await serviceAdmin.rpc('crm_mark_stale_portal_listings', {
    p_agency_id: agencyId,
    p_portal: PORTAL,
    p_threshold: '36 hours',
  });
  if (error) throw new Error('portal_sync_stale_check_failed');
  return Number(data || 0);
}

export async function syncStoriaAgency(
  serviceAdmin: SupabaseClient,
  agencyId: string,
  triggerType: 'cron' | 'manual',
  jobKey: string | null,
): Promise<StoriaSyncSummary> {
  const empty: SyncCounts = {
    checked: 0,
    active: 0,
    changed: 0,
    missing: 0,
    errors: 0,
    stale: 0,
  };
  const { data: runId, error: startError } = await serviceAdmin.rpc(
    'crm_start_portal_sync_run',
    {
      p_agency_id: agencyId,
      p_portal: PORTAL,
      p_trigger_type: triggerType,
      p_job_key: jobKey,
    },
  );
  if (startError) throw new Error('portal_sync_start_failed');
  if (!runId) {
    return {
      ...empty,
      agency_id: agencyId,
      run_id: null,
      status: 'skipped',
      error_code: 'already_running_or_duplicate',
    };
  }

  const counts = { ...empty };
  let rows: PortalListingRow[] = [];
  try {
    rows = await listingRows(serviceAdmin, agencyId);
    const token = await getValidToken(serviceAdmin, agencyId);
    if (!token) throw new StoriaApiError('token_unavailable', 401);

    const remoteChecks = await fetchAllAdvertStatuses(token);
    const byExternalId = new Map(
      remoteChecks
        .filter(check => check.externalId)
        .map(check => [check.externalId as string, check]),
    );

    for (const listing of rows) {
      const startedAt = Date.now();
      const checkedAt = new Date().toISOString();
      if (!listing.external_id) {
        await recordCheck(
          serviceAdmin,
          listing,
          runId,
          'error',
          null,
          checkedAt,
          Date.now() - startedAt,
          'external_id_missing',
          'Listarea nu are UUID-ul API necesar verificării.',
        );
        counts.checked += 1;
        counts.errors += 1;
        continue;
      }
      const check = byExternalId.get(listing.external_id);
      const recorded = check
        ? await recordCheck(
          serviceAdmin,
          listing,
          runId,
          'verified',
          check,
          checkedAt,
          Date.now() - startedAt,
        )
        : await recordCheck(
          serviceAdmin,
          listing,
          runId,
          'not_found',
          {
            verified: true,
            exists: false,
            status: 'deleted',
            externalId: listing.external_id,
            portalAdId: listing.portal_ad_id,
            advertUrl: listing.advert_url,
            reason: 'Anunțul nu apare în catalogul complet de metadate Storia.',
            errorCode: null,
            payload: {
              external_id: listing.external_id,
              remote_exists: false,
              status: 'deleted',
            },
            raw: {},
          },
          checkedAt,
          Date.now() - startedAt,
        );
      counts.checked += 1;
      counts.active += recorded.status === 'active' ? 1 : 0;
      counts.changed += recorded.changed ? 1 : 0;
      counts.missing += recorded.result === 'not_found' ? 1 : 0;
      counts.errors += recorded.status === 'error' || recorded.status === 'rejected' ? 1 : 0;
    }

    counts.stale = await markStale(serviceAdmin, agencyId);
    const status = counts.errors > 0 || counts.stale > 0 ? 'partial' : 'completed';
    await finishRun(serviceAdmin, agencyId, runId, status, counts);
    return {
      ...counts,
      agency_id: agencyId,
      run_id: runId,
      status,
      error_code: null,
    };
  } catch (caught) {
    const code = errorCode(caught);
    const message = errorMessage(code);
    for (const listing of rows) {
      try {
        await recordCheck(
          serviceAdmin,
          listing,
          runId,
          'error',
          null,
          new Date().toISOString(),
          0,
          code,
          message,
        );
        counts.checked += 1;
        counts.errors += 1;
      } catch {
        // The run-level failure below remains the authoritative health signal.
      }
    }
    counts.stale = await markStale(serviceAdmin, agencyId);
    await finishRun(serviceAdmin, agencyId, runId, 'failed', counts, code, message);
    return {
      ...counts,
      agency_id: agencyId,
      run_id: runId,
      status: 'failed',
      error_code: code,
    };
  }
}

export async function syncOneStoriaListing(
  serviceAdmin: SupabaseClient,
  agencyId: string,
  listingId: string,
) {
  const { data } = await serviceAdmin
    .from('portal_listings')
    .select('id,agency_id,property_id,agent_id,external_id,portal_ad_id,advert_url,status')
    .eq('id', listingId)
    .eq('agency_id', agencyId)
    .eq('portal', PORTAL)
    .maybeSingle();
  const listing = data as PortalListingRow | null;
  if (!listing) return null;

  const { data: property } = await serviceAdmin
    .from('properties')
    .select('agent_id')
    .eq('id', listing.property_id)
    .eq('agency_id', agencyId)
    .maybeSingle();
  listing.agent_id = property?.agent_id || listing.agent_id;

  const startedAt = Date.now();
  const checkedAt = new Date().toISOString();
  if (!listing.external_id) {
    return recordCheck(
      serviceAdmin,
      listing,
      null,
      'error',
      null,
      checkedAt,
      Date.now() - startedAt,
      'external_id_missing',
      'Listarea nu are UUID-ul API necesar verificării.',
    );
  }

  try {
    const token = await getValidToken(serviceAdmin, agencyId);
    if (!token) throw new StoriaApiError('token_unavailable', 401);
    const check = await fetchAdvertStatus(listing.external_id, token);
    return recordCheck(
      serviceAdmin,
      listing,
      null,
      check.exists === false ? 'not_found' : 'verified',
      check,
      checkedAt,
      Date.now() - startedAt,
    );
  } catch (caught) {
    const code = errorCode(caught);
    return recordCheck(
      serviceAdmin,
      listing,
      null,
      'error',
      null,
      checkedAt,
      Date.now() - startedAt,
      code,
      errorMessage(code),
    );
  }
}
