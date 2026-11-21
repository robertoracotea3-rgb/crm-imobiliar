import { NextResponse } from 'next/server';
import { crmConfig, crmHeaders } from '@/lib/public-properties';

/*
 * "Adaugă anunț" on the public site: the owner's request goes into the CRM as a "Preluare" activity
 * (De făcut), through crm_site_preluare() in the CRM database (online/crm-online.sql, version 5).
 * The function checks everything again and limits how many requests arrive; this route only adds the
 * same-origin check, the size limit and the bot traps, and never returns anything from the database.
 */

export const dynamic = 'force-dynamic';

const TYPES = new Set(['Apartament', 'Garsonieră', 'Casă / Vilă', 'Teren', 'Spațiu comercial', 'Birou', 'Spațiu industrial', 'Cameră']);
// One-line fields: control characters and runs of spaces become one space.
const text = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/[\s\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max) : '');
const amount = (v: unknown, max: number) => (typeof v === 'number' && Number.isFinite(v) && v > 0 && v <= max ? v : null);
const reply = (status: number, body: Record<string, unknown>) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  const host = (req.headers.get('x-forwarded-host') || req.headers.get('host') || '').split(',')[0].trim().toLowerCase();
  if (!origin || !host) return false;
  try { return new URL(origin).host.toLowerCase() === host; } catch { return false; }
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return reply(403, { ok: false, error: 'forbidden' });
  if (Number(req.headers.get('content-length') || 0) > 8000) return reply(413, { ok: false, error: 'too_large' });
  const raw = await req.text();
  if (raw.length > 8000) return reply(413, { ok: false, error: 'too_large' });
  let b: Record<string, unknown>;
  try {
    const v: unknown = JSON.parse(raw);
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw new Error('shape');
    b = v as Record<string, unknown>;
  } catch {
    return reply(400, { ok: false, error: 'bad_request' });
  }
  // Bot traps: a hidden field people never see, and a three-step form filled in under three seconds.
  // The answer looks like a success so the bot does not try again.
  if (text(b.website, 200) || (typeof b.t === 'number' && b.t < 3000)) return reply(200, { ok: true });

  const p = {
    tranzactie: b.tranzactie === 'inchiriere' ? 'inchiriere' : 'vanzare',
    tip: TYPES.has(text(b.tip, 40)) ? text(b.tip, 40) : 'Proprietate',
    localitate: text(b.localitate, 80), zona: text(b.zona, 80),
    suprafata: amount(b.suprafata, 1_000_000), camere: amount(b.camere, 99), pret: amount(b.pret, 1_000_000_000),
    detalii: typeof b.detalii === 'string' ? b.detalii.replace(/\r/g, '').replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').trim().slice(0, 1500) : '',
    nume: text(b.nume, 80), telefon: text(b.telefon, 30), email: text(b.email, 120).toLowerCase(),
  };
  const digits = p.telefon.replace(/\D/g, '').length;
  if (!p.nume || !p.localitate || digits < 9 || digits > 15 || (p.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(p.email))) {
    return reply(400, { ok: false, error: 'bad_request' });
  }

  const cfg = crmConfig();
  if (!cfg) return reply(503, { ok: false, error: 'not_configured' });
  try {
    const res = await fetch(`${cfg.url}/rest/v1/rpc/crm_site_preluare`, {
      method: 'POST',
      headers: { ...crmHeaders(cfg.key), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ p }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    if (res.ok) return reply(200, { ok: true });
    const why = await res.text().catch(() => '');
    if (/too_many/.test(why)) return reply(429, { ok: false, error: 'too_many' });
    // Most often: the CRM database does not have version 5 of crm-online.sql yet.
    return reply(502, { ok: false, error: /crm_site_preluare|PGRST202|42883/.test(why) ? 'crm_old' : 'crm_error' });
  } catch {
    return reply(504, { ok: false, error: 'crm_unreachable' });
  }
}
