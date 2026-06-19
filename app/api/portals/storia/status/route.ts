import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidToken, fetchAdvertStatus } from '@/lib/storia-api';

// Statuses that are still in OLX's processing pipeline — worth re-syncing from OLX.
const NON_TERMINAL = new Set(['pending', 'not_posted', 'to_post', 'processing']);

// GET /api/portals/storia/status?property_id=<optional>
// Returns: connection status + listings for a specific property (or all listings).
export async function GET(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data: agency } = await supabase.from('agencies').select('id').single();
  if (!agency) return NextResponse.json({ error: 'No agency' }, { status: 400 });

  // Check connection
  const { data: tokenRow } = await supabase
    .from('portal_tokens')
    .select('expires_at, scope, created_at')
    .eq('agency_id', agency.id)
    .eq('portal', 'storia')
    .single();

  const connected = !!tokenRow;
  const token = connected ? await getValidToken(supabase, agency.id) : null;
  const tokenValid = !!token;

  const { searchParams } = new URL(request.url);
  const propertyId = searchParams.get('property_id');

  let listing = null;
  let listings: unknown[] = [];

  if (propertyId) {
    const { data } = await supabase
      .from('portal_listings')
      .select('*')
      .eq('property_id', propertyId)
      .eq('portal', 'storia')
      .single();
    listing = data;

    // Recover from missed webhooks: if the listing is still in OLX's pipeline,
    // pull the live status straight from OLX and persist it.
    if (token && listing?.external_id && NON_TERMINAL.has(String(listing.status))) {
      try {
        const live = await fetchAdvertStatus(listing.external_id, token);
        if (live && live.status !== listing.status) {
          const patch = {
            status:        live.status,
            error_message: live.reason || null,
            raw_response:  live.raw as Record<string, unknown>,
            last_sync_at:  new Date().toISOString(),
            updated_at:    new Date().toISOString(),
          };
          await supabase.from('portal_listings')
            .update(patch)
            .eq('id', listing.id);
          listing = { ...listing, ...patch };
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
    listings = data || [];

    // Refresh button (Portaluri page): re-sync any listing still in OLX's pipeline.
    if (token) {
      listings = await Promise.all((listings as Record<string, unknown>[]).map(async (l) => {
        if (!l.external_id || !NON_TERMINAL.has(String(l.status))) return l;
        try {
          const live = await fetchAdvertStatus(l.external_id as string, token);
          if (live && live.status !== l.status) {
            const patch = {
              status:        live.status,
              error_message: live.reason || null,
              raw_response:  live.raw as Record<string, unknown>,
              last_sync_at:  new Date().toISOString(),
              updated_at:    new Date().toISOString(),
            };
            await supabase.from('portal_listings').update(patch).eq('id', l.id as string);
            return { ...l, ...patch };
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
    connected_at: tokenRow?.created_at || null,
    listing,
    listings,
    credentials_configured: !!(
      process.env.STORIA_CLIENT_ID && process.env.STORIA_CLIENT_SECRET && process.env.STORIA_API_KEY
    ),
  });
}
