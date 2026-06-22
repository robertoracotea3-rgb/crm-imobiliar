export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

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
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const { data, error } = await admin
      .from('properties')
      .select('id, internal_code, title, city, county, zone, street, street_number, price, currency, category, created_at, updated_at, attributes, status, transaction, agent_id, owner_contact_id, latitude, longitude')
      .eq('agency_id', profile.agency_id)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) return Response.json({ error: errMsg(error) }, { status: 500 });

    // Real publication state per property. Storia/OLX come from portal_listings;
    // "Site propriu" is live when status is 'activa' and attributes.publicare.site is set.
    const { data: listings } = await admin
      .from('portal_listings')
      .select('property_id, portal, status')
      .eq('agency_id', profile.agency_id)
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
