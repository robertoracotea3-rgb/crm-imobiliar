import { NextResponse } from 'next/server';
import { getValidToken, fetchAdvertStatus } from '@/lib/storia-api';
import { extractStoriaAdvertIdentity } from '@/lib/server/storia-ad-identity.mjs';
import { requireApiAuth } from '@/lib/server/api-auth';
import { portalTokenEncryptionConfigured } from '@/lib/server/portal-token-crypto.mjs';

// Statuses that are worth re-syncing from OLX.
// Includes 'error' because an error may reflect a failed update attempt on our side
// (e.g. expired token during PUT) while the advert is still POSTED on OLX.
const NON_TERMINAL = new Set(['pending', 'not_posted', 'to_post', 'to_put', 'processing', 'error']);

interface PortalConnectionStatus {
  connection_status: string | null;
  expires_at: string | null;
  scope: string | null;
  connected_at: string | null;
  created_at: string | null;
  last_refreshed_at: string | null;
  refresh_failure_count: number | null;
  last_refresh_error_code: string | null;
}

// GET /api/portals/storia/status?property_id=<optional>
// Returns: connection status + listings for a specific property (or all listings).
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get('property_id');
  const auth = await requireApiAuth(request, propertyId
    ? { module: 'properties', action: 'view' }
    : { module: 'portals', action: 'view' });
  if (!auth.ok) return auth.response;
  const { admin, serviceAdmin: supabase, agencyId } = auth.context;

  // Vederea agregată pe toată agenția (fără property_id, folosită în pagina Portaluri)
  // e date de management → doar owner/admin. Statusul unei singure proprietăți
  // (cu property_id) rămâne accesibil agenților din pagina proprietății.
  const agency = { id: agencyId };
  if (propertyId) {
    const { data: accessibleProperty } = await admin
      .from('properties')
      .select('id')
      .eq('id', propertyId)
      .eq('agency_id', agencyId)
      .maybeSingle();
    if (!accessibleProperty) return NextResponse.json({ error: 'Proprietatea nu este accesibilă' }, { status: 404 });
  }

  // Check connection
  const { data: rawTokenRow } = await supabase
    .from('portal_tokens')
    .select([
      'connection_status','expires_at','scope','connected_at','created_at',
      'last_refreshed_at','refresh_failure_count','last_refresh_error_code',
    ].join(','))
    .eq('agency_id', agency.id)
    .eq('portal', 'storia')
    .maybeSingle();
  const tokenRow = rawTokenRow as PortalConnectionStatus | null;

  const connectionStatus = tokenRow?.connection_status
    || (tokenRow ? 'connected' : 'disconnected');
  const connected = connectionStatus === 'connected';
  const token = connected ? await getValidToken(supabase, agency.id) : null;
  const tokenValid = !!token;

  let listing = null;
  let listings: unknown[] = [];

  if (propertyId) {
    const { data } = await supabase
      .from('portal_listings')
      .select('*')
      .eq('agency_id', agencyId)
      .eq('property_id', propertyId)
      .eq('portal', 'storia')
      .single();
    listing = data;

    // Recover from missed webhooks: if the listing is still in OLX's pipeline,
    // pull the live status straight from OLX and persist it.
    if (token && listing?.external_id && NON_TERMINAL.has(String(listing.status))) {
      try {
        const live = await fetchAdvertStatus(listing.external_id, token);
        const liveReason = live?.reason || null;
        const statusChanged = live && live.status !== listing.status;
        const reasonChanged = live && liveReason !== (listing.error_message || null);
        const identity = live ? extractStoriaAdvertIdentity(live.raw) : null;
        const identityChanged = Boolean(
          identity && (
            (identity.portalAdId && identity.portalAdId !== listing.portal_ad_id)
            || (identity.externalId && identity.externalId !== listing.external_id)
            || (identity.advertUrl && identity.advertUrl !== listing.advert_url)
          )
        );
        if (statusChanged || reasonChanged || identityChanged) {
          const patch = {
            ...(statusChanged ? { status: live!.status } : {}),
            ...(identity?.portalAdId ? { portal_ad_id: identity.portalAdId } : {}),
            ...(identity?.externalId ? { external_id: identity.externalId } : {}),
            ...(identity?.advertUrl ? { advert_url: identity.advertUrl } : {}),
            error_message: liveReason,
            raw_response:  live!.raw as Record<string, unknown>,
            last_sync_at:  new Date().toISOString(),
            updated_at:    new Date().toISOString(),
          };
          await supabase.from('portal_listings')
            .update(patch)
            .eq('id', listing.id)
            .eq('agency_id', agencyId);
          listing = { ...listing, ...patch };
        } else if (live) {
          // Always update last_sync_at so we know the OLX check ran successfully.
          await supabase.from('portal_listings')
            .update({ last_sync_at: new Date().toISOString() })
            .eq('id', listing.id)
            .eq('agency_id', agencyId);
          listing = { ...listing, last_sync_at: new Date().toISOString() };
        }
      } catch (e) {
        console.error('[Storia status] live sync failed', e);
      }
    }
  } else {
    const { data } = await supabase
      .from('portal_listings')
      .select('*')
      .eq('agency_id', agency.id)
      .eq('portal', 'storia')
      .order('updated_at', { ascending: false });

    // Enrich with property title + internal code. There's no FK relationship
    // between portal_listings and properties in the schema, so an embedded join
    // (PGRST200) fails — fetch the properties separately and merge by id.
    const rows = (data || []) as Record<string, unknown>[];
    const propIds = [...new Set(rows.map(l => l.property_id).filter(Boolean))] as string[];
    const propMap = new Map<string, { title: string; internal_code: string }>();
    if (propIds.length > 0) {
      const { data: props } = await supabase
        .from('properties')
        .select('id, title, internal_code')
        .eq('agency_id', agencyId)
        .in('id', propIds);
      for (const p of (props || []) as { id: string; title: string; internal_code: string }[]) {
        propMap.set(p.id, { title: p.title, internal_code: p.internal_code });
      }
    }
    listings = rows.map(l => {
      const prop = propMap.get(l.property_id as string);
      return {
        ...l,
        property_title: prop?.title || null,
        internal_code: prop?.internal_code || null,
      };
    });

    // Refresh button (Portaluri page): re-sync any listing still in OLX's pipeline.
    if (token) {
      listings = await Promise.all((listings as Record<string, unknown>[]).map(async (l) => {
        if (!l.external_id || !NON_TERMINAL.has(String(l.status))) return l;
        try {
          const live = await fetchAdvertStatus(l.external_id as string, token);
          const liveReason = live?.reason || null;
          const statusChanged = live && live.status !== l.status;
          const reasonChanged = live && liveReason !== ((l.error_message as string) || null);
          const identity = live ? extractStoriaAdvertIdentity(live.raw) : null;
          const identityChanged = Boolean(
            identity && (
              (identity.portalAdId && identity.portalAdId !== l.portal_ad_id)
              || (identity.externalId && identity.externalId !== l.external_id)
              || (identity.advertUrl && identity.advertUrl !== l.advert_url)
            )
          );
          if (statusChanged || reasonChanged || identityChanged) {
            const patch = {
              ...(statusChanged ? { status: live!.status } : {}),
              ...(identity?.portalAdId ? { portal_ad_id: identity.portalAdId } : {}),
              ...(identity?.externalId ? { external_id: identity.externalId } : {}),
              ...(identity?.advertUrl ? { advert_url: identity.advertUrl } : {}),
              error_message: liveReason,
              raw_response:  live!.raw as Record<string, unknown>,
              last_sync_at:  new Date().toISOString(),
              updated_at:    new Date().toISOString(),
            };
            await supabase.from('portal_listings').update(patch).eq('id', l.id as string).eq('agency_id', agencyId);
            return { ...l, ...patch };
          } else if (live) {
            await supabase.from('portal_listings')
              .update({ last_sync_at: new Date().toISOString() })
              .eq('id', l.id as string)
              .eq('agency_id', agencyId);
            return { ...l, last_sync_at: new Date().toISOString() };
          }
        } catch (e) {
          console.error('[Storia status] live sync failed', e);
        }
        return l;
      }));
    }
  }

  return NextResponse.json({
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
    credentials_configured: !!(
      process.env.STORIA_CLIENT_ID
      && process.env.STORIA_CLIENT_SECRET
      && process.env.STORIA_API_KEY
      && portalTokenEncryptionConfigured()
    ),
  });
}
