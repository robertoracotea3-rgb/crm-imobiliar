import { DbError, dbMessage, isCrmMember, isPortalKey, runStoria } from '@/lib/storia';

/*
 * Sends to Storia what the CRM changed. Called by Kira Imobiliare (phone and PC) after it uploads a property, with the
 * agent's session (only accounts the administrator added), by Administrator CRM Kira's "Trimite acum pe Storia" (with
 * KIRA_PORTAL_KEY) and by Vercel Cron once a day (vercel.json).
 */
export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Max-Age': '86400',
  'Cache-Control': 'no-store',
};

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS });
}

async function run(headers: Record<string, string>) {
  try {
    return Response.json(await runStoria(), { headers });
  } catch (e) {
    return Response.json({ ok: false, mesaj: e instanceof DbError ? dbMessage(e.code) : 'Storia nu răspunde acum; se încearcă din nou la următoarea schimbare.' }, { status: 503, headers });
  }
}

export async function POST(request: Request) {
  const auth = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!isPortalKey(auth) && !(await isCrmMember(auth))) return Response.json({ ok: false, mesaj: 'cont fără acces la CRM' }, { status: 401, headers: CORS });
  return run(CORS);
}

// Vercel Cron, once a day: whatever an app could not start, and it keeps the Storia access fresh.
export async function GET(request: Request) {
  const secret = (process.env.CRON_SECRET || '').trim();
  const allowed = secret ? request.headers.get('authorization') === `Bearer ${secret}` : /vercel-cron/i.test(request.headers.get('user-agent') || '');
  if (!allowed) return Response.json({ ok: false }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  return run({ 'Cache-Control': 'no-store' });
}
