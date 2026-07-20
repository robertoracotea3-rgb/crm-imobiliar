export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

function errMsg(e: unknown): string {
  if (!e) return 'Eroare';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    return String(o.message || o.details || JSON.stringify(e));
  }
  return String(e);
}

export async function GET(request: Request) {
  try {
    const auth = await requireApiAuth(request, { module: 'properties', action: 'view' });
    if (!auth.ok) return auth.response;
    const { admin, agencyId } = auth.context;

    const { data, error } = await admin
      .from('properties')
      .select('id, internal_code, title, city, county, zone, street, street_number, price, currency, category, created_at, updated_at, attributes, status, transaction, agent_id, owner_contact_id, latitude, longitude')
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) return Response.json({ error: errMsg(error) }, { status: 500 });

    // Real publication state per property. Storia/OLX come from portal_listings;
    // "Site propriu" is live when status is 'activa' and attributes.publicare.site is set.
    const { data: listings } = await admin
      .from('portal_listings')
      .select('property_id, portal, status')
      .eq('agency_id', agencyId)
      .in('status', ['active', 'pending', 'to_put']);
    const listingsByProp = new Map<string, { portal: string; status: string }[]>();
    for (const l of listings || []) {
      const arr = listingsByProp.get(l.property_id) || [];
      arr.push(l);
      listingsByProp.set(l.property_id, arr);
    }

    const properties = (data || []).map((p) => {
      const attrs = (p.attributes || {}) as Record<string, unknown>;
      const pub = (attrs.publicare || {}) as Record<string, boolean>;
      const publications: { portal: string; isEnabled: boolean; status: 'published' | 'pending' }[] = [];

      // Site propriu — exactly the condition the public website uses.
      if (p.status === 'activa' && pub.site) {
        publications.push({ portal: 'Site propriu', isEnabled: true, status: 'published' });
      }
      // Storia + OLX — a single storia listing cross-posts to both.
      const storia = (listingsByProp.get(p.id) || []).find((x) => x.portal === 'storia');
      if (storia) {
        const st = storia.status === 'active' ? 'published' : 'pending';
        publications.push({ portal: 'Storia', isEnabled: true, status: st });
        publications.push({ portal: 'OLX', isEnabled: true, status: st });
      }
      return { ...p, publications };
    });

    return Response.json({ properties });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
