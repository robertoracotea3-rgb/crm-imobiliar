import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

const supabase = createClient(supabaseUrl, supabaseAnonKey);

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const agencyId = searchParams.get('agency_id');

    let query = supabase.from('properties').select('*');

    if (agencyId) {
      query = query.eq('agency_id', agencyId);
    }

    const { data: properties, error } = await query.limit(1000);

    if (error) throw error;

    const xmlHeader = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0">
  <channel>
    <title>Proprietati Imobiliare</title>
    <link>https://example.com</link>
    <description>Feed de proprietati din CRM Imobiliar</description>
    <lastBuildDate>${new Date().toISOString()}</lastBuildDate>`;

    const xmlItems = (properties || [])
      .map(
        (prop) => `
    <item>
      <title>${escapeXml(prop.title)}</title>
      <description>${escapeXml(prop.description || '')}</description>
      <category>${escapeXml(prop.category)}</category>
      <location>${escapeXml(prop.location)}</location>
      <price currency="RON">${prop.price}</price>
      <internalCode>${escapeXml(prop.internal_code)}</internalCode>
      <details>
        <bedrooms>${prop.attributes?.bedrooms || 'N/A'}</bedrooms>
        <bathrooms>${prop.attributes?.bathrooms || 'N/A'}</bathrooms>
        <area>${prop.attributes?.area || 'N/A'}</area>
      </details>
      <published>${new Date(prop.created_at).toISOString()}</published>
      <updated>${new Date(prop.updated_at).toISOString()}</updated>
    </item>`
      )
      .join('\n');

    const xmlFooter = `
  </channel>
</rss>`;

    const xml = xmlHeader + xmlItems + xmlFooter;

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Content-Disposition': `attachment; filename="properties-${new Date().getTime()}.xml"`,
      },
    });
  } catch (error) {
    console.error('Feed Error:', error);
    return new Response('Error generating feed', { status: 500 });
  }
}

function escapeXml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}
