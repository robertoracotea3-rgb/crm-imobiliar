import { NextResponse } from 'next/server';
import { getValidToken, olxFetch } from '@/lib/storia-api';
import { requireApiAuth } from '@/lib/server/api-auth';

// POST /api/portals/storia/unpublish
// Body: { property_id: string }
// Deletes the Storia listing for this property.
export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'portals', action: 'delete' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin: supabase, agencyId } = auth.context;

  const { property_id } = await request.json();
  if (!property_id) return NextResponse.json({ error: 'property_id obligatoriu' }, { status: 400 });

  const agency = { id: agencyId };

  const { data: listing } = await supabase
    .from('portal_listings')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('property_id', property_id)
    .eq('portal', 'storia')
    .single();

  if (!listing?.external_id) {
    return NextResponse.json({ error: 'Niciun anunț activ pe Storia pentru această proprietate' }, { status: 404 });
  }

  const token = await getValidToken(supabase, agency.id);
  if (!token) {
    return NextResponse.json({ error: 'Contul Storia nu este conectat' }, { status: 400 });
  }

  const storiaResponse = await olxFetch(`/advert/v1/${listing.external_id}`, token, {
    method: 'DELETE',
  });

  if (!storiaResponse.ok && storiaResponse.status !== 404) {
    const result = await storiaResponse.json().catch(() => ({}));
    return NextResponse.json({ error: 'Eroare la ștergere', details: result }, { status: storiaResponse.status });
  }

  await supabase.from('portal_listings').update({
    status:       'deleted',
    last_sync_at: new Date().toISOString(),
    updated_at:   new Date().toISOString(),
  }).eq('id', listing.id).eq('agency_id', agencyId);

  return NextResponse.json({ success: true });
}
