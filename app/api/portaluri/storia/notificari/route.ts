import { DbError, portalDb, storiaConfigProblem, validSignature } from '@/lib/storia';

/*
 * OLX's notifications (the "notification callback URL" in Application Manager): advert states and buyers' messages.
 * Each one is checked (x-signature) and handed to crm_portal_eveniment, which takes it once. OLX wants a 2xx within
 * 2 seconds; any other answer makes it send again (every 5 minutes, about 2 hours), so a busy database loses nothing.
 */
export const dynamic = 'force-dynamic';

// The "Test callback" button in Application Manager, and availability checks.
export function GET() {
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const raw = (await request.text().catch(() => '')).slice(0, 70000);
  let e: unknown = null;
  try { e = raw ? JSON.parse(raw) : null; } catch { e = null; }
  if (!e || typeof e !== 'object' || Array.isArray(e)) return Response.json({ ok: true });
  const ev = e as Record<string, unknown>;
  const objectId = ev.object_id == null ? '' : String(ev.object_id);
  const transactionId = ev.transaction_id == null ? '' : String(ev.transaction_id);
  if (!objectId && !transactionId) return Response.json({ ok: true });
  if (storiaConfigProblem()) return Response.json({ ok: false }, { status: 503 });
  if (!validSignature(request.headers.get('x-signature'), objectId, transactionId)) return Response.json({ ok: false }, { status: 401 });
  try {
    await portalDb('crm_portal_eveniment', { e: ev }, 1700);
  } catch (err) {
    return Response.json({ ok: false, cod: err instanceof DbError ? err.code : 'eroare' }, { status: 503 });
  }
  return Response.json({ ok: true });
}
