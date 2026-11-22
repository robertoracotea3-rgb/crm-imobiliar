import { crmConfig, crmHeaders } from '@/lib/public-properties';
import { withLogo } from '@/lib/watermark';

export const maxDuration = 30;

const PHOTO_ID = /^[A-Za-z0-9_-]{6,128}$/;
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);

function missing() {
  return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=60, s-maxage=60' } });
}

/**
 * A photo of a property published on the site, from the CRM's private photo space ("crm-poze").
 * The database lets the site read only the photos of the properties ticked "Site Kira" and active;
 * any other photo answers 404. A photo never changes (a new photo gets a new id), so it can be cached.
 * The public copy carries the Kira logo, transparent, in the middle (lib/watermark.ts); the CRM keeps the original.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const cfg = crmConfig();
  if (!cfg || !PHOTO_ID.test(id)) return missing();
  try {
    const res = await fetch(`${cfg.url}/storage/v1/object/authenticated/crm-poze/${id}`, { headers: crmHeaders(cfg.key), cache: 'no-store', signal: AbortSignal.timeout(8000) });
    const type = (res.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (!res.ok || !res.body || !TYPES.has(type)) return missing();
    const original = new Uint8Array(await res.arrayBuffer());
    let body: Uint8Array<ArrayBuffer> = original, outType = type;
    try {
      body = await withLogo(original);
      outType = 'image/jpeg';
    } catch (e) {
      // A photo the logo cannot be put on is shown as it is, rather than not at all.
      console.error('poze: logo', id, e);
    }
    return new Response(body, {
      headers: {
        'Content-Type': outType,
        'Cache-Control': 'public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return missing();
  }
}
