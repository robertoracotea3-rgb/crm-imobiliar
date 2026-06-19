import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { getValidToken, olxFetch, propertyToAdvert, missingAdvertFields } from '@/lib/storia-api';

// POST /api/portals/storia/publish
// Body: { property_id: string }
// Creates or updates the Storia listing for this property.
export async function POST(request: Request) {
  const authHeader = request.headers.get('Authorization');
  if (!authHeader) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: { user } } = await supabase.auth.getUser(authHeader.replace('Bearer ', ''));
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { property_id } = await request.json();
  if (!property_id) return NextResponse.json({ error: 'property_id obligatoriu' }, { status: 400 });

  const { data: agency } = await supabase.from('agencies').select('id').single();
  if (!agency) return NextResponse.json({ error: 'No agency' }, { status: 400 });

  const token = await getValidToken(supabase, agency.id);
  if (!token) {
    return NextResponse.json(
      { error: 'Contul Storia nu este conectat. Conectați-vă din pagina Portaluri.' },
      { status: 400 }
    );
  }

  // Fetch property
  const { data: property } = await supabase
    .from('properties')
    .select('*')
    .eq('id', property_id)
    .single();
  if (!property) return NextResponse.json({ error: 'Proprietatea nu a fost găsită' }, { status: 404 });

  const a = (property.attributes as Record<string, unknown>) || {};

  // Pre-flight: OLX requires price + location (coordinates). Fail early with a
  // clear message instead of letting the raw OLX validation error bubble up.
  const missing = missingAdvertFields(property, a);
  if (missing.length > 0) {
    return NextResponse.json(
      { error: `Nu se poate publica pe Storia. Completează: ${missing.join(', ')}.` },
      { status: 400 }
    );
  }

  const advertPayload = propertyToAdvert(property, a);

  // Check existing listing
  const { data: existing } = await supabase
    .from('portal_listings')
    .select('*')
    .eq('property_id', property_id)
    .eq('portal', 'storia')
    .single();

  let storiaResponse: Response;
  let method: string;

  // OLX rule (per developer-support): PUT may only be used to update an advert
  // that is actually POSTED on the portal. For any other state — pending/TO_POST,
  // error, rejected, not_posted — the advert isn't live yet, so a PUT is rejected
  // ASYNCHRONOUSLY with `advert_put_error` even though it returns "Data is valid"
  // synchronously. We must POST to (re)create it. Only `active` (POSTED) → PUT.
  const isLiveOnPortal = !!existing?.external_id && existing.status === 'active';

  if (isLiveOnPortal) {
    // Update the live advert — PUT /advert/v1/{uuid}.
    method = 'PUT';
    const putRes = await olxFetch(`/advert/v1/${existing!.external_id}`, token, {
      method: 'PUT',
      body: JSON.stringify(advertPayload),
    });

    if (putRes.status === 404) {
      // OLX no longer has this advert — recreate it.
      method = 'POST';
      storiaResponse = await olxFetch('/advert/v1', token, {
        method: 'POST',
        body: JSON.stringify(advertPayload),
      });
    } else {
      storiaResponse = putRes;
    }
  } else {
    // Create (or re-create) the advert — POST /advert/v1.
    method = 'POST';
    storiaResponse = await olxFetch('/advert/v1', token, {
      method: 'POST',
      body: JSON.stringify(advertPayload),
    });
  }

  const result = await storiaResponse.json().catch(() => ({})) as Record<string, unknown>;

  if (!storiaResponse.ok) {
    await supabase.from('portal_listings').upsert(
      {
        agency_id:     agency.id,
        property_id,
        portal:        'storia',
        status:        'error',
        error_message: JSON.stringify(result),
        last_sync_at:  new Date().toISOString(),
        updated_at:    new Date().toISOString(),
      },
      { onConflict: 'property_id,portal' }
    );
    return NextResponse.json(
      { error: 'Eroare API Storia', details: result },
      { status: storiaResponse.status }
    );
  }

  // OLX wraps the result: { message, data: { uuid, last_action_status } }.
  // Fall back to top-level keys for safety across endpoints.
  const data = (result.data || result) as Record<string, unknown>;
  const externalId = (data.uuid || data.id || data.advert_id || existing?.external_id) as string | undefined;
  const advertUrl  = (data.url || data.advert_url || existing?.advert_url) as string | undefined;
  // OLX statuses: TO_POST / POSTED / TO_DELETE / REJECTED. Map TO_POST → pending.
  const rawStatus  = (data.last_action_status || data.status || 'pending') as string;
  const status     = rawStatus === 'TO_POST' ? 'pending'
                   : rawStatus === 'POSTED'  ? 'active'
                   : rawStatus === 'REJECTED' ? 'rejected'
                   : String(rawStatus).toLowerCase();

  await supabase.from('portal_listings').upsert(
    {
      agency_id:     agency.id,
      property_id,
      portal:        'storia',
      external_id:   externalId,
      status,
      advert_url:    advertUrl,
      last_sync_at:  new Date().toISOString(),
      error_message: null,
      raw_response:  result,
      updated_at:    new Date().toISOString(),
    },
    { onConflict: 'property_id,portal' }
  );

  // Photos are sent inline via the advert `images[]` array (no separate endpoint).

  return NextResponse.json({
    success:     true,
    method,
    external_id: externalId,
    advert_url:  advertUrl,
    status,
  });
}
