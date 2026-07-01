export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function esc(s: string | null | undefined): string {
  return (s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const agencyId = url.searchParams.get('agency_id');
    if (!agencyId) {
      return new Response('agency_id parameter required', { status: 400 });
    }

    const { data: properties, error } = await admin
      .from('properties')
      .select('id, internal_code, title, description, price, currency, category, transaction, status, city, county, zone, street, street_number, surface_useful, surface_built, surface_land, attributes, created_at, updated_at')
      .eq('agency_id', agencyId)
      .eq('status', 'activa')
      .limit(500);

    if (error) return new Response(`DB error: ${error.message}`, { status: 500 });

    const props = properties || [];
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://crm.example.com';

    const items = props.map(p => {
      const attrs = (p.attributes || {}) as Record<string, unknown>;
      const photos = (attrs.photos as string[] | null) || [];
      // Feed-ul livrează varianta LARGE (1600px), nu medium (800px), ca portalurile care
      // importă din feed să afișeze poze clare pe mare. Legacy fără /medium.webp → no-op.
      const photoXml = photos.slice(0, 10).map((ph: string) =>
        `      <photo><url>${esc(ph.replace('/medium.webp', '/large.webp'))}</url></photo>`
      ).join('\n');

      return `  <property>
    <id>${esc(p.id)}</id>
    <code>${esc(p.internal_code)}</code>
    <title>${esc(p.title)}</title>
    <description>${esc(p.description)}</description>
    <price>${p.price || 0}</price>
    <currency>${esc(p.currency)}</currency>
    <category>${esc(p.category)}</category>
    <transaction>${esc(p.transaction)}</transaction>
    <city>${esc(p.city)}</city>
    <county>${esc(p.county)}</county>
    <zone>${esc(p.zone)}</zone>
    <street>${esc(p.street)}</street>
    <surface_useful>${p.surface_useful || ''}</surface_useful>
    <surface_built>${p.surface_built || ''}</surface_built>
    <surface_land>${p.surface_land || ''}</surface_land>
    <url>${baseUrl}/properties/${esc(p.id)}</url>
    <created_at>${p.created_at}</created_at>
    <updated_at>${p.updated_at || p.created_at}</updated_at>
    <photos>
${photoXml}
    </photos>
  </property>`;
    }).join('\n');

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<properties count="${props.length}" generated="${new Date().toISOString()}">
${items}
</properties>`;

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      },
    });
  } catch (err) {
    return new Response(`Server error: ${err instanceof Error ? err.message : String(err)}`, { status: 500 });
  }
}
