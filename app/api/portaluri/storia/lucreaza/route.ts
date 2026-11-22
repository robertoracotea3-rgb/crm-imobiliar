import { runOlx } from '@/lib/olx';
import { DbError, dbMessage, isCrmMember, runStoria } from '@/lib/storia';

/*
 * Sends to Storia and to OLX.ro what the CRM changed, and reads new OLX.ro messages. Called by Kira Imobiliare (phone
 * and PC) after it uploads a property, with the agent's session (only accounts the administrator added), and by Vercel
 * Cron once a day (vercel.json).
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

// Storia and OLX.ro at the same time (each stops after about 45 seconds). OLX.ro only answers in "olx".
async function run(headers: Record<string, string>) {
  const [storia, olx] = await Promise.allSettled([runStoria(), runOlx()]);
  const o = olx.status === 'fulfilled' ? olx.value : {
    ok: false,
    activ: false,
    mesaj: olx.reason instanceof DbError
      ? (olx.reason.code === 'old_sql' ? 'Baza nu are încă partea de OLX.ro: rulează crm-online.sql (versiunea 7).' : dbMessage(olx.reason.code))
      : 'OLX nu răspunde acum; se încearcă din nou la următoarea schimbare.',
  };
  if (storia.status === 'rejected') {
    const e = storia.reason;
    return Response.json({ ok: false, mesaj: e instanceof DbError ? dbMessage(e.code) : 'Storia nu răspunde acum; se încearcă din nou la următoarea schimbare.', olx: o }, { status: 503, headers });
  }
  return Response.json({ ...storia.value, olx: o }, { headers });
}

export async function POST(request: Request) {
  const jwt = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (!(await isCrmMember(jwt))) return Response.json({ ok: false, mesaj: 'cont fără acces la CRM' }, { status: 401, headers: CORS });
  return run(CORS);
}

// Vercel Cron, once a day: whatever an app could not start, and it keeps the Storia and OLX access fresh.
export async function GET(request: Request) {
  const secret = (process.env.CRON_SECRET || '').trim();
  const allowed = secret ? request.headers.get('authorization') === `Bearer ${secret}` : /vercel-cron/i.test(request.headers.get('user-agent') || '');
  if (!allowed) return Response.json({ ok: false }, { status: 401, headers: { 'Cache-Control': 'no-store' } });
  return run({ 'Cache-Control': 'no-store' });
}
