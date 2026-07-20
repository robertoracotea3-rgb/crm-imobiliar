export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';
import { buildPublicPropertyUrl } from '@/lib/public-property-url';

type PropertySummary = {
  id?: string | null;
  internal_code?: string | null;
  title?: string | null;
  city?: string | null;
  county?: string | null;
  category?: string | null;
  attributes?: Record<string, unknown> | null;
};

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'leads', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;

    const { data, error } = await admin
      .from('leads')
      .select('*')
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .order('received_at', { ascending: false })
      .limit(200);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    const rows = data || [];
    const propIds = [...new Set(rows.map((l) => l.property_id).filter(Boolean))] as string[];
    let propById: Record<string, PropertySummary> = {};

    if (propIds.length) {
      const { data: props } = await admin
        .from('properties')
        .select('id, internal_code, title, city, county, category, attributes')
        .eq('agency_id', agencyId)
        .is('deleted_at', null)
        .in('id', propIds);

      propById = Object.fromEntries((props || []).map((p) => [p.id, p]));
    }

    const leads = rows.map((l) => {
      const p = (l.property_id && propById[l.property_id]) || {};
      return {
        ...l,
        property_title: l.property_title || p.title || null,
        property_code: p.internal_code || null,
        property_public_url: p.id ? buildPublicPropertyUrl({
          id: p.id,
          internal_code: p.internal_code,
          category: p.category,
          city: p.city,
          attributes: p.attributes,
        }) : null,
        city: l.city || p.city || null,
        county: l.county || p.county || null,
        category: l.category || p.category || null,
      };
    });

    return Response.json({ leads });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
