import { NextResponse } from 'next/server';

import { requireApiAuth } from '@/lib/server/api-auth';
import {
  syncOneStoriaListing,
  syncStoriaAgency,
} from '@/lib/server/storia-listing-sync';

// POST /api/portals/storia/sync
// Body may contain property_id for one listing; otherwise verifies the agency.
export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'portals', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin, agencyId } = auth.context;
  const body = await request.json().catch(() => ({})) as { property_id?: unknown };
  const propertyId = typeof body.property_id === 'string' ? body.property_id : null;

  if (propertyId) {
    const { data: listing } = await serviceAdmin
      .from('portal_listings')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('property_id', propertyId)
      .eq('portal', 'storia')
      .maybeSingle();
    if (!listing) {
      return NextResponse.json({ error: 'Listarea Storia nu a fost găsită.' }, { status: 404 });
    }
    const result = await syncOneStoriaListing(serviceAdmin, agencyId, listing.id);
    return NextResponse.json(
      { success: Boolean(result), result },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  const summary = await syncStoriaAgency(
    serviceAdmin,
    agencyId,
    'manual',
    null,
  );
  return NextResponse.json(
    { success: summary.status !== 'failed', summary },
    {
      status: summary.status === 'failed' ? 502 : 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  );
}
