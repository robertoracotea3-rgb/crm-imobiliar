import { NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getValidToken } from '@/lib/storia-api';
import { requireApiAuth } from '@/lib/server/api-auth';
import { portalTokenEncryptionConfigured } from '@/lib/server/portal-token-crypto.mjs';
import {
  listingNeedsOnDemandCheck,
  presentStoriaListing,
} from '@/lib/server/storia-listing-state.mjs';
import { syncOneStoriaListing } from '@/lib/server/storia-listing-sync';

interface PortalConnectionStatus {
  connection_status: string | null;
  expires_at: string | null;
  connected_at: string | null;
  created_at: string | null;
  last_refreshed_at: string | null;
  refresh_failure_count: number | null;
  last_refresh_error_code: string | null;
}

const LISTING_FIELDS = [
  'id','agency_id','property_id','portal','external_id','portal_ad_id','status',
  'advert_url','last_sync_at','error_message','created_at','updated_at','agent_id',
  'remote_status','remote_exists','last_checked_at','last_check_result',
  'last_error_at','last_error_code','last_check_payload',
  'consecutive_check_failures','verified_active_at','next_check_at','stale_alerted_at',
].join(',');

async function enrichListings(
  supabase: SupabaseClient,
  agencyId: string,
  source: Record<string, unknown>[],
) {
  const propertyIds = [...new Set(source.map(row => row.property_id).filter(Boolean))] as string[];
  const propertyMap = new Map<string, {
    title: string | null;
    internal_code: string | null;
    agent_id: string | null;
  }>();
  if (propertyIds.length) {
    const { data: properties } = await supabase
      .from('properties')
      .select('id,title,internal_code,agent_id')
      .eq('agency_id', agencyId)
      .in('id', propertyIds);
    for (const property of properties || []) {
      propertyMap.set(property.id, property);
    }
  }

  const agentIds = [...new Set(
    [...propertyMap.values()].map(property => property.agent_id).filter(Boolean),
  )] as string[];
  const agentMap = new Map<string, string>();
  if (agentIds.length) {
    const { data: profiles } = await supabase
      .from('profiles')
      .select('user_id,full_name')
      .eq('agency_id', agencyId)
      .in('user_id', agentIds);
    for (const profile of profiles || []) {
      agentMap.set(profile.user_id, profile.full_name || 'Agent fără nume');
    }
  }

  return source.map(row => {
    const property = propertyMap.get(row.property_id as string);
    const agentId = property?.agent_id || row.agent_id as string | null;
    return presentStoriaListing({
      ...row,
      agent_id: agentId,
      agent_name: agentId ? agentMap.get(agentId) || null : null,
      property_title: property?.title || null,
      internal_code: property?.internal_code || null,
    });
  });
}

// GET /api/portals/storia/status?property_id=<optional>
// Reads stored status. A property-level read performs a bounded metadata recovery
// only when that listing has not been checked recently.
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get('property_id');
  const auth = await requireApiAuth(
    request,
    propertyId
      ? { module: 'properties', action: 'view' }
      : { module: 'portals', action: 'view' },
  );
  if (!auth.ok) return auth.response;
  const { admin, serviceAdmin, agencyId } = auth.context;

  if (propertyId) {
    const { data: accessibleProperty } = await admin
      .from('properties')
      .select('id')
      .eq('id', propertyId)
      .eq('agency_id', agencyId)
      .maybeSingle();
    if (!accessibleProperty) {
      return NextResponse.json({ error: 'Proprietatea nu este accesibilă' }, { status: 404 });
    }
  }

  const { data: rawTokenRow } = await serviceAdmin
    .from('portal_tokens')
    .select([
      'connection_status','expires_at','connected_at','created_at',
      'last_refreshed_at','refresh_failure_count','last_refresh_error_code',
    ].join(','))
    .eq('agency_id', agencyId)
    .eq('portal', 'storia')
    .maybeSingle();
  const tokenRow = rawTokenRow as PortalConnectionStatus | null;
  const connectionStatus = tokenRow?.connection_status
    || (tokenRow ? 'connected' : 'disconnected');
  const connected = connectionStatus === 'connected';
  const token = connected ? await getValidToken(serviceAdmin, agencyId) : null;
  const tokenValid = Boolean(token);

  let listing: Record<string, unknown> | null = null;
  let listings: Record<string, unknown>[] = [];
  if (propertyId) {
    const { data } = await serviceAdmin
      .from('portal_listings')
      .select(LISTING_FIELDS)
      .eq('agency_id', agencyId)
      .eq('property_id', propertyId)
      .eq('portal', 'storia')
      .maybeSingle();
    listing = data as Record<string, unknown> | null;
    if (token && listing && listingNeedsOnDemandCheck(listing)) {
      const listingId = listing.id as string;
      await syncOneStoriaListing(serviceAdmin, agencyId, listingId);
      const { data: refreshed } = await serviceAdmin
        .from('portal_listings')
        .select(LISTING_FIELDS)
        .eq('id', listingId)
        .eq('agency_id', agencyId)
        .maybeSingle();
      listing = refreshed as Record<string, unknown> | null;
    }
    listing = listing
      ? (await enrichListings(serviceAdmin, agencyId, [listing]))[0]
      : null;
  } else {
    const { data } = await serviceAdmin
      .from('portal_listings')
      .select(LISTING_FIELDS)
      .eq('agency_id', agencyId)
      .eq('portal', 'storia')
      .order('updated_at', { ascending: false })
      .limit(1000);
    listings = await enrichListings(
      serviceAdmin,
      agencyId,
      (data || []) as unknown as Record<string, unknown>[],
    );
  }

  const { data: health } = await serviceAdmin
    .from('portal_sync_health')
    .select([
      'status','last_started_at','last_success_at','last_error_at',
      'last_error_code','last_duration_ms','last_checked_count',
      'consecutive_failures','stale_listing_count','next_run_at',
    ].join(','))
    .eq('agency_id', agencyId)
    .eq('portal', 'storia')
    .maybeSingle();

  const staleCount = listings.filter(row => row.status === 'stale').length;
  const unverifiedCount = listings.filter(row => row.status === 'unverified').length;
  return NextResponse.json(
    {
      connected,
      token_valid: tokenValid,
      connection_status: tokenValid ? 'connected' : connectionStatus,
      connected_at: tokenRow?.connected_at || tokenRow?.created_at || null,
      expires_at: tokenRow?.expires_at || null,
      last_refreshed_at: tokenRow?.last_refreshed_at || null,
      refresh_failure_count: tokenRow?.refresh_failure_count || 0,
      last_refresh_error_code: tokenRow?.last_refresh_error_code || null,
      listing,
      listings,
      stale_count: staleCount,
      unverified_count: unverifiedCount,
      sync_health: health || null,
      credentials_configured: Boolean(
        process.env.STORIA_CLIENT_ID
        && process.env.STORIA_CLIENT_SECRET
        && process.env.STORIA_API_KEY
        && portalTokenEncryptionConfigured()
      ),
    },
    { headers: { 'Cache-Control': 'no-store' } },
  );
}
