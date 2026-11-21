import { crmConfig, crmHeaders } from '@/lib/public-properties';

const PHOTO_ID = /^[A-Za-z0-9_-]{6,128}$/;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function missing() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } });
}

/**
 * A photo of a property published on the site, from the CRM's private photo space ("crm-poze").
 * The database lets the site read only the photos of the properties ticked "Site Kira" and active;
 * any other photo answers 404. A photo never changes (a new photo gets a new id), so it can be cached.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cfg = crmConfig();
  if (!cfg || !PHOTO_ID.test(id)) return missing();
  try {
    const res = await fetch(`${cfg.url}/storage/v1/object/authenticated/crm-poze/${id}`, { headers: crmHeaders(cfg.key), cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!res.ok || !res.body || !TYPES.has(type)) return missing();
    return new Response(res.body, {
      headers: {
        'Content-Type': type,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return missing();
  }
}
