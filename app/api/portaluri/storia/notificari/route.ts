import { after } from 'next/server';
import { DbError, loadKeys, portalDb, portalKeyProblem, runStoria, validSignature } from '@/lib/storia';

/*
 * OLX's notifications (the "notification callback URL" in Application Manager): advert states, the OLX.ro export's
 * states and buyers' messages. Each one is checked (x-signature) and handed to crm_portal_eveniment, which takes it
 * once. OLX wants a 2xx within 2 seconds; any other answer makes it send again (every 5 minutes, about 2 hours), so a
 * busy database loses nothing. When an advert ticked "OLX" is now live on Storia, the export is asked for right after.
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

// The "Test callback" button in Application Manager, and availability checks.
export function GET() {
  return Response.json({ ok: true }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: Request) {
  const t0 = Date.now();
  const raw = (await request.text().catch(() => '')).slice(0, 70000);
  let e: unknown = null;
  try { e = raw ? JSON.parse(raw) : null; } catch { e = null; }
  if (!e || typeof e !== 'object' || Array.isArray(e)) return Response.json({ ok: true });
  const ev = e as Record<string, unknown>;
  const objectId = ev.object_id == null ? '' : String(ev.object_id);
  const transactionId = ev.transaction_id == null ? '' : String(ev.transaction_id);
  if (!objectId && !transactionId) return Response.json({ ok: true });
  // The Notification secret comes from the database (Administrator CRM Kira), kept a minute; until it is there: 503.
  if (portalKeyProblem()) return Response.json({ ok: false }, { status: 503 });
  const keys = await loadKeys().then((a) => a.keys, () => null);
  if (!keys) return Response.json({ ok: false }, { status: 503 });
  const signature = request.headers.get('x-signature');
  if (!validSignature(keys.webhookSecret, signature, objectId, transactionId)) {
    if (!/^[0-9a-f]{40}$/i.test((signature || '').trim())) return Response.json({ ok: false }, { status: 401 });
    // Signed, but not with this secret: the Administrator may have just changed it, so it is read again; still another
    // one, the Administrator shows that the Notification secret is not the one in Application Manager.
    const now = await loadKeys(true).then((a) => a.keys, () => null);
    if (!now || now.webhookSecret === keys.webhookSecret || !validSignature(now.webhookSecret, signature, objectId, transactionId)) {
      after(() => portalDb('crm_portal_semnatura_gresita', {}, 3000).then(() => undefined, () => undefined));
      return Response.json({ ok: false }, { status: 401 });
    }
  }
  let r: { olx_de_cerut?: boolean } | null = null;
  try {
    // Within OLX's 2 seconds, whatever reading the keys took.
    r = await portalDb<{ olx_de_cerut?: boolean } | null>('crm_portal_eveniment', { e: ev }, Math.max(400, 1800 - (Date.now() - t0)));
  } catch (err) {
    return Response.json({ ok: false, cod: err instanceof DbError ? err.code : 'eroare' }, { status: 503 });
  }
  if (r?.olx_de_cerut) after(() => runStoria().then(() => undefined, () => undefined));
  return Response.json({ ok: true });
}
