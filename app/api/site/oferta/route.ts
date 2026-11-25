import { NextResponse } from 'next/server';
import { countOffer, OFFER_TOKEN } from '@/lib/offers';

/*
 * Called by the offer page (/oferta/<token>) in the client's browser, once it is on screen: {t: token} for an opening,
 * {t: token, p: property id} for a property looked at. The database checks them and ignores quick reloads.
 */

export const dynamic = 'force-dynamic';

const reply = (status: number, ok: boolean) => NextResponse.json({ ok }, { status, headers: { 'Cache-Control': 'no-store' } });

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0].trim().toLowerCase();
  if (!origin || !host) return false;
  try { return new URL(origin).host.toLowerCase() === host; } catch { return false; }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return reply(403, false);
  const raw = await req.text();
  if (raw.length > 300) return reply(413, false);
  let token = '', prop: string | null = null;
  try {
    const b = JSON.parse(raw) as { t?: unknown; p?: unknown };
    if (typeof b.t === 'string') token = b.t;
    if (typeof b.p === 'string' && b.p.length <= 128) prop = b.p;
  } catch { /* not JSON: refused below */ }
  if (!OFFER_TOKEN.test(token)) return reply(400, false);
  return reply(200, await countOffer(token, prop));
}
