import 'server-only';
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { autoTitle, crmConfig, crmHeaders } from '@/lib/public-properties';
import { canonicalHost } from '@/lib/site-host';

/*
 * Storia (and OLX.ro, through Storia's export) for the Kira Imobiliare CRM, over the OLX Group Real Estate Partner API.
 *
 * - The agency's Storia account is connected once, from Administrator CRM Kira (/api/portaluri/storia/conectare).
 * - Properties ticked "Storia" and active are published, updated and removed by runStoria(), started by the CRM apps
 *   after a change (/api/portaluri/storia/lucreaza), by the notifications and once a day by Vercel Cron.
 * - One that leaves Storia while it is still in the CRM (unticked, no longer Activă) is stopped (deactivate), not deleted:
 *   ticked again, or extended once expired, the same advert starts again (activate), with its link and history; Storia
 *   would take a deleted advert posted again within 24 hours as unpaid. Only one deleted from the CRM is deleted there.
 * - Those also ticked "OLX" go on to OLX.ro: the export is a promotion (VAS) of the Storia advert, asked for with the
 *   same Storia account (the app needs the read:vas and write:vas scopes; free with Storia's Premium and Optimum
 *   packages, paid with Basic). On OLX.ro the advert shows in the lists and opens on Storia, so buyers write through
 *   Storia: their messages come in like any other Storia message.
 * - OLX notifications (advert and export states, messages from buyers) arrive at /api/portaluri/storia/notificari; a
 *   message becomes a client and an activity in the CRM (crm_portal_mesaj in crm-online.sql, version 9).
 *
 * The site reaches the CRM's database only through the crm_portal_* functions, with KIRA_PORTAL_KEY, its only Storia
 * setting in Vercel. The OLX Group app's keys (Client ID, Client secret, API key, Notification secret) are put in from
 * Administrator CRM Kira and kept in the database (crm_portal_app_get, crm-online.sql version 10); the STORIA_* variables
 * in Vercel are used only while the database has none. Docs: https://developer.olxgroup.com/docs
 */

export const OLX_API = 'https://api.olxgroup.com';
const TOKEN_URL = `${OLX_API}/oauth/v1/token`;
export const STORIA_AUTH_URL = 'https://www.storia.ro/ro/crm/authorization/';
const SITE_URN = 'urn:site:storiaro';
const USER_AGENT = 'KiraImobiliare/1.0';

const env = (k: string) => (process.env[k] || '').trim().replace(/^(["'])(.*)\1$/, '$2').trim();
const PORTAL_KEY = /^kp_[0-9a-f]{64}$/;

/** What is missing in Vercel itself for Storia (KIRA_PORTAL_KEY, the database's address), or null. Never repeats a value. */
export function portalKeyProblem(): string | null {
  const k = env('KIRA_PORTAL_KEY');
  if (!k) return 'lipsește KIRA_PORTAL_KEY din Vercel: o copiezi din Administrator CRM Kira › Setări › Storia / OLX, apoi Redeploy';
  if (!PORTAL_KEY.test(k)) return 'KIRA_PORTAL_KEY nu are forma kp_… (o copiezi din Administrator CRM Kira)';
  if (!crmConfig()) return 'lipsesc KIRA_CRM_URL / KIRA_CRM_PUBLISHABLE_KEY';
  return null;
}

/** Is this the KIRA_PORTAL_KEY from Vercel? (Administrator CRM Kira's "Trimite acum pe Storia"; constant-time compare.) */
export function isPortalKey(s: string): boolean {
  const k = env('KIRA_PORTAL_KEY');
  return PORTAL_KEY.test(k) && PORTAL_KEY.test(s) && timingSafeEqual(Buffer.from(k), Buffer.from(s));
}

/* ---------- the OLX Group app's keys: from Administrator CRM Kira (the database), else from Vercel ---------- */

export type AppKeys = { clientId: string; clientSecret: string; apiKey: string; webhookSecret: string; from: 'administrator' | 'vercel' };
type DbKeys = { client_id?: string; client_secret?: string; api_key?: string; webhook_secret?: string } | null;
type KeysAnswer = { keys: AppKeys | null; oldSql: boolean };
let keysCache: (KeysAnswer & { at: number }) | null = null;

function vercelKeys(): AppKeys | null {
  const k = { clientId: env('STORIA_CLIENT_ID'), clientSecret: env('STORIA_CLIENT_SECRET'), apiKey: env('STORIA_API_KEY'), webhookSecret: env('STORIA_WEBHOOK_SECRET') };
  return k.clientId && k.clientSecret && k.apiKey && k.webhookSecret ? { ...k, from: 'vercel' } : null;
}

/**
 * The app's keys: put in from Administrator CRM Kira (the database, version 10), else STORIA_* from Vercel; null when
 * neither has all four. Kept a minute (5 seconds when there are none). oldSql: the database is older than version 10.
 * Throws DbError (KIRA_PORTAL_KEY not the database's, database down).
 */
export async function loadKeys(fresh = false): Promise<KeysAnswer> {
  if (!fresh && keysCache && Date.now() - keysCache.at < (keysCache.keys ? 60_000 : 5_000)) return keysCache;
  let keys: AppKeys | null = null, oldSql = false;
  try {
    const k = await portalDb<DbKeys>('crm_portal_app_get');
    if (k && k.client_id && k.client_secret && k.api_key && k.webhook_secret) {
      keys = { clientId: k.client_id, clientSecret: k.client_secret, apiKey: k.api_key, webhookSecret: k.webhook_secret, from: 'administrator' };
    }
  } catch (e) {
    if (!(e instanceof DbError && e.code === 'old_sql')) throw e;
    oldSql = true;
  }
  keysCache = { keys: keys || vercelKeys(), oldSql, at: Date.now() };
  return keysCache;
}

/** What is missing for Storia, or null (then loadKeys() has the keys). Never repeats a value. Throws DbError. */
export async function storiaConfigProblem(fresh = false): Promise<string | null> {
  const p = portalKeyProblem();
  if (p) return p;
  const { keys, oldSql } = await loadKeys(fresh);
  if (keys) return null;
  return oldSql
    ? 'baza nu are încă locul pentru cheile aplicației OLX Group: rulează crm-online.sql (versiunea 10), apoi pune cheile în Administrator CRM Kira › Setări › Storia / OLX'
    : 'lipsesc cheile aplicației OLX Group: le pui în Administrator CRM Kira › Setări › Storia / OLX';
}

/* ---------- the CRM's database (crm_portal_* functions, with KIRA_PORTAL_KEY) ---------- */

export class DbError extends Error {
  constructor(public code: string) { super(code); }
}

export async function portalDb<T = unknown>(fn: string, args: Record<string, unknown> = {}, timeoutMs = 8000): Promise<T> {
  const cfg = crmConfig();
  if (!cfg) throw new DbError('no_db');
  let res: Response;
  try {
    res = await fetch(`${cfg.url}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { ...crmHeaders(cfg.key), 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ p_key: env('KIRA_PORTAL_KEY'), ...args }),
      cache: 'no-store',
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch {
    throw new DbError('db_unreachable');
  }
  const text = await res.text();
  if (!res.ok) {
    let code = `HTTP ${res.status}`;
    try {
      const j = JSON.parse(text) as { code?: string; message?: string };
      if (/bad_key/.test(j.message || '')) code = 'bad_key';
      else if (j.code === 'PGRST202' || j.code === '42883') code = 'old_sql';
      else if (j.code) code = String(j.code).slice(0, 20);
    } catch { /* not JSON */ }
    throw new DbError(code);
  }
  return (text ? JSON.parse(text) : null) as T;
}

/** Is this Supabase session (from the CRM app) an account the administrator gave access to? */
export async function isCrmMember(jwt: string): Promise<boolean> {
  const cfg = crmConfig();
  if (!cfg || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(jwt) || jwt.length > 8000) return false;
  try {
    const res = await fetch(`${cfg.url}/rest/v1/rpc/crm_info`, {
      method: 'POST',
      headers: { apikey: cfg.key, Authorization: `Bearer ${jwt}`, 'Content-Type': 'application/json' },
      body: '{}',
      cache: 'no-store',
      signal: AbortSignal.timeout(6000),
    });
    if (!res.ok) return false;
    const j = (await res.json()) as { member?: boolean };
    return j?.member === true;
  } catch {
    return false;
  }
}

/* ---------- OLX: keys and tokens ---------- */

function olxHeaders(k: AppKeys, extra: Record<string, string> = {}): Record<string, string> {
  return { 'X-API-KEY': k.apiKey, 'User-Agent': USER_AGENT, Accept: 'application/json', ...extra };
}

type Tokens = { access_token: string; refresh_token: string; expires_in?: number };
type TokenResult = { ok: true; t: Tokens } | { ok: false; status: number; code: string; error: string };

/** OLX refused the app's own keys (Client ID, Client secret or API key) while refreshing: the account is kept. */
class KeysRefused extends Error {}

async function tokenCall(k: AppKeys, body: Record<string, string>): Promise<TokenResult> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: olxHeaders(k, {
        Authorization: 'Basic ' + Buffer.from(`${k.clientId}:${k.clientSecret}`).toString('base64'),
        'Content-Type': 'application/x-www-form-urlencoded',
      }),
      body: new URLSearchParams(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { ok: false, status: 0, code: '', error: 'OLX nu răspunde' };
  }
  const text = await res.text();
  let j: Record<string, unknown> = {};
  try { j = JSON.parse(text); } catch { /* not JSON */ }
  if (res.ok && typeof j.access_token === 'string' && typeof j.refresh_token === 'string') return { ok: true, t: j as unknown as Tokens };
  return { ok: false, status: res.status, code: typeof j.error === 'string' ? j.error : '', error: String(j.error_description || j.error || j.message || text || `HTTP ${res.status}`).slice(0, 300) };
}

/** The code from Storia's authorization page (valid 60 seconds) for the account's tokens. */
export const exchangeCode = (k: AppKeys, code: string) => tokenCall(k, { grant_type: 'authorization_code', code });

/** A valid access token, refreshed when it expires in under 5 minutes (only one worker runs at a time). */
async function accessToken(k: AppKeys, force = false): Promise<string | null> {
  for (let i = 0; i < 3; i++) {
    const c = await portalDb<{ access_token: string; refresh_token: string; expira: number } | null>('crm_portal_cont_get');
    if (!c) return null;
    if (!force && c.expira - Date.now() > 5 * 60_000) return c.access_token;
    const r = await tokenCall(k, { grant_type: 'refresh_token', refresh_token: c.refresh_token });
    if (!r.ok) {
      if (r.code === 'invalid_grant' || (r.status === 400 && r.code !== 'invalid_client')) {
        // The account's access refused for good (password changed, access withdrawn), unless someone refreshed it meanwhile.
        const now = await portalDb<{ refresh_token: string } | null>('crm_portal_cont_get');
        if (now && now.refresh_token !== c.refresh_token) { force = false; continue; }
        await portalDb('crm_portal_cont_sterge');
        return null;
      }
      // The app's keys refused (invalid_client, a wrong API key): fixed in the Administrator, the account stays connected.
      if (r.status === 401 || r.status === 403) throw new KeysRefused(r.error);
      throw new Error('OLX token: ' + r.error);
    }
    const saved = await portalDb<{ ok: boolean }>('crm_portal_cont_set', { p: { ...r.t, vechi: c.refresh_token } });
    if (saved?.ok) return r.t.access_token;
    force = false;
  }
  return null;
}

/* ---------- a CRM property as a Storia advert ---------- */

export type Listing = {
  id?: string; cod?: string; titlu?: string; descriere?: string; tranzactie?: string; tip?: string;
  pret?: number; suprafata?: number; suprafataTeren?: number; camere?: number;
  judet?: string; localitate?: string; zona?: string;
  geo?: { lat: number; lng: number; aprox?: boolean } | null; poze?: string[];
};

// CRM type → Storia category family (URNs checked against GET /taxonomy/v1/categories/partner/urn:site:storiaro).
const FAMILY: Record<string, 'apartments' | 'houses' | 'lots' | 'stores' | 'warehouses'> = {
  'Apartament': 'apartments', 'Garsonieră': 'apartments', 'Casă / Vilă': 'houses', 'Teren': 'lots',
  'Spațiu comercial': 'stores', 'Birou': 'stores', 'Spațiu industrial': 'warehouses',
};
const pos = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const roomsOf = (l: Listing) => pos(l.camere) ?? (l.tip === 'Garsonieră' ? 1 : null);

/** What the CRM must fill before the advert can go to Storia (the CRM shows the same list). Empty when ready. */
export function listingProblems(l: Listing): string[] {
  const fam = FAMILY[l.tip || ''];
  if (!fam) return [`tipul „${l.tip || 'fără tip'}” nu se publică automat pe Storia`];
  const p: string[] = [];
  if ((l.descriere || '').trim().length < 50) p.push('descrierea anunțului (cel puțin 50 de caractere)');
  if (!pos(l.pret)) p.push('prețul');
  if (!l.geo || typeof l.geo.lat !== 'number' || typeof l.geo.lng !== 'number') p.push('pinul pe hartă (la Locație)');
  if (!(l.poze || []).length) p.push('cel puțin o poză');
  if ((fam === 'apartments' || fam === 'houses') && !roomsOf(l)) p.push('numărul de camere');
  if (fam !== 'lots' && !pos(l.suprafata)) p.push('suprafața utilă');
  if (fam === 'houses' && !pos(l.suprafataTeren)) p.push('suprafața terenului');
  if (fam === 'lots' && !pos(l.suprafataTeren) && !pos(l.suprafata)) p.push('suprafața terenului');
  return p;
}

function cut(s: string, n: number): string {
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const c = s.slice(0, n + 1), i = c.lastIndexOf(' ');
  return (i > n * 0.6 ? c.slice(0, i) : s.slice(0, n)).replace(/[\s,.;:–-]+$/, '');
}
const html = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\r/g, '').replace(/\n/g, '<br/>');
/** The text as HTML in at most n characters: cut in the text (at a space when it can), never inside "&amp;" or "<br/>". */
function htmlUpTo(s: string, n: number): string {
  if (html(s).length <= n) return html(s);
  let lo = 0, hi = s.length;
  while (lo < hi) { const m = Math.ceil((lo + hi) / 2); if (html(s.slice(0, m)).length <= n - 1) lo = m; else hi = m - 1; }
  const c = s.slice(0, lo), i = c.lastIndexOf(' ');
  return html((i > lo * 0.9 ? c.slice(0, i) : c).replace(/[\s,.;:–-]+$/, '') + '…');
}

/**
 * OLX.ro's rules for the text of an advert exported from Storia: no links or e-mail addresses, no runs of more than
 * three of the same sign (!!!!, ----), and not all in capitals (then it is written in sentence case).
 */
export function olxText(s: string): string {
  let t = s
    .replace(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g, ' ')
    .replace(/(?:https?:\/\/|www\.)\S+/gi, ' ')
    .replace(/\b[\w-]+(?:\.[\w-]+)*\.(?:ro|com|net|org|eu|info|biz|io)\b(?:\/\S*)?/g, ' ')
    .replace(/([!?.,\-=+#%&@*_><:()|])\1{3,}/g, (_m, c: string) => c.repeat(3))
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([,.;:!?])/g, (_m, c: string) => c);
  const letters = t.match(/\p{L}/gu) || [];
  const capitals = t.match(/\p{Lu}/gu) || [];
  if (letters.length >= 10 && capitals.length / letters.length > 0.7) {
    t = t.toLowerCase().replace(/(^\s*|[.!?]\s+|\n\s*)(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
  }
  return t.trim();
}

export function advertTitle(l: Listing, forOlx = false): string {
  let t = (l.titlu || '').trim();
  if (forOlx) t = olxText(t);
  if (!t || (forOlx && t.length < 5)) {
    t = autoTitle({
      tip: l.tip || null, camere: l.camere ?? null, suprafata: l.suprafata ?? null, tranzactie: l.tranzactie || null,
      zona: l.zona || null, localitate: l.localitate || null,
    });
  }
  return cut(t, 70);
}

/**
 * The advert for POST/PUT /advert/v1. Only the listing: never the street, the number, the owner or the notes.
 * forOlx: the property is also ticked "OLX", so the text and the areas follow OLX.ro's rules for the export too.
 */
export function buildAdvert(propId: string, l: Listing, forOlx = false): Record<string, unknown> {
  const fam = FAMILY[l.tip || ''];
  const sale = l.tranzactie !== 'inchiriere';
  const cat = { apartments: 'apartments', houses: 'houses', lots: 'lots', stores: 'stores', warehouses: 'warehouses' }[fam];
  const attributes: { urn: string; value: string }[] = [];
  const add = (urn: string, v: string | number | null) => { if (v != null && v !== '') attributes.push({ urn: `urn:concept:${urn}`, value: String(v) }); };
  // OLX.ro takes whole square metres only.
  const area = (v: number | null) => (v != null && forOlx ? Math.max(1, Math.round(v)) : v);
  const rooms = roomsOf(l);
  const roomsUrn = rooms ? (rooms > 10 ? 'urn:concept:more' : `urn:concept:${Math.round(rooms)}`) : null;
  if (fam === 'apartments' || fam === 'houses') add('number-of-rooms', roomsUrn);
  if (fam === 'lots') add('net-area-m2', area(pos(l.suprafataTeren) ?? pos(l.suprafata)));
  else add('net-area-m2', area(pos(l.suprafata)));
  if (fam === 'houses') add('terrain-area-m2', area(pos(l.suprafataTeren)));
  if (sale && fam !== 'lots') add('market', 'urn:concept:secondary');
  const text = (l.descriere || '').trim();
  const advert: Record<string, unknown> = {
    site_urn: SITE_URN,
    title: advertTitle(l, forOlx),
    description: htmlUpTo(forOlx ? olxText(text) : text, 9000),
    category_urn: `urn:concept:${cat}-for-${sale ? 'sale' : 'rent'}`,
    price: { value: Math.round(l.pret || 0), currency: 'EUR' },
    attributes,
    images: (l.poze || []).slice(0, 24).map((id) => ({ url: `${canonicalHost()}/poze/${id}` })),
    custom_fields: { id: propId },
  };
  if (l.geo) advert.location = { lat: l.geo.lat, lon: l.geo.lng, exact: !l.geo.aprox };
  return advert;
}

export const advertHash = (a: Record<string, unknown>) => createHash('sha256').update(JSON.stringify(a)).digest('hex').slice(0, 40);

/* ---------- OLX notifications ---------- */

/** x-signature = HMAC-SHA1 (key: the app's Notification secret) of "<object_id>,<transaction_id>", hex. */
export function validSignature(secret: string, signature: string | null, objectId: string, transactionId: string): boolean {
  if (!secret || !signature || !/^[0-9a-f]{40}$/i.test(signature.trim())) return false;
  const expected = createHmac('sha1', secret).update(`${objectId},${transactionId}`).digest();
  return timingSafeEqual(expected, Buffer.from(signature.trim(), 'hex'));
}

/* ---------- the worker: publish, update and remove ---------- */

type Job = { prop_id: string; rev: number; date: Listing; uuid: string | null; stare: string | null; hash: string | null; olx?: boolean };
// mod (version 9): 'opreste' = stop it (deactivate; the property is still in the CRM), 'sterge' = delete it.
type Removal = { prop_id: string; uuid: string; stare: string; mod?: 'opreste' | 'sterge' };
type OlxJob = { prop_id: string; uuid: string };
type OlxCheck = { prop_id: string; uuid: string; vas: string | null; cerut: number | null };
type Answer = { status: number; json: Record<string, unknown>; text: string };

/** One call to the OLX Group API; without a token for the public lists (taxonomy). */
async function olx(k: AppKeys, method: string, path: string, token: string | null, body?: unknown): Promise<Answer> {
  try {
    const res = await fetch(`${OLX_API}${path}`, {
      method,
      headers: olxHeaders(k, { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }),
      body: body ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let json: Record<string, unknown> = {};
    try { json = text ? JSON.parse(text) : {}; } catch { /* not JSON */ }
    return { status: res.status, json, text: text.slice(0, 2000) };
  } catch {
    return { status: 0, json: {}, text: 'OLX nu răspunde' };
  }
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' ? v as Obj : {});

function reason(a: Answer): string {
  const j = obj(a.json);
  const err = obj(j.error);
  const dataErr = obj(obj(j.data).error);
  const v = err.validation || dataErr.validation || j.validation || j.errors;
  if (Array.isArray(v) && v.length) {
    return v.map((x: unknown) => { const o = obj(x); return o.detail || o.message || o.field || JSON.stringify(x); }).join('; ').slice(0, 1500);
  }
  return String(err.detail || dataErr.detail || j.message || j.error_description || (typeof j.error === 'string' ? j.error : '') || a.text || `HTTP ${a.status}`).slice(0, 1500);
}

const expired = (a: Answer) => a.status === 401 || (a.status === 403 && /expired/i.test(a.text));
const NOT_LIVE = new Set(['scos', 'se_scoate', 'refuzat', 'expirat', 'oprit', 'se_opreste']);
// Started again (activate) rather than posted anew: stopped by the site, expired, or taken off by hand in the Storia account.
const REVIVE = new Set(['oprit', 'se_opreste', 'expirat', 'scos']);

export type RunResult = { ok: boolean; mesaj: string; trimise: number; scoase: number; olx: number };
type Work = {
  ocupat?: boolean; conectat?: boolean; pune?: Job[]; scoate?: Removal[]; olx?: OlxJob[]; olx_verifica?: OlxCheck[];
};

/** Does what the CRM asks of Storia and of the OLX.ro export (at most ~45 seconds; the rest at the next call). */
export async function runStoria(): Promise<RunResult> {
  const out: RunResult = { ok: true, mesaj: '', trimise: 0, scoase: 0, olx: 0 };
  // The keys as they are now (the Administrator may have just changed them); notifications use the minute-old copy.
  const problem = await storiaConfigProblem(true);
  if (problem) return { ...out, ok: false, mesaj: problem };
  const k = (await loadKeys()).keys as AppKeys;
  const deadline = Date.now() + 45_000;
  for (let round = 0; round < 6 && Date.now() < deadline; round++) {
    const w = await portalDb<Work>('crm_portal_lucru');
    if (w?.ocupat) return { ...out, mesaj: out.mesaj || 'altă trecere e în lucru' };
    if (!w?.conectat) return { ...out, mesaj: 'contul Storia nu e conectat' };
    const pune = w.pune || [], scoate = w.scoate || [], cere = w.olx || [], verifica = w.olx_verifica || [];
    // A live advert just ticked "OLX" (nothing else changed): its export is asked for in the next round, right away.
    let more = false;
    try {
      if (!pune.length && !scoate.length && !cere.length && !verifica.length) return { ...out, mesaj: out.mesaj || (round ? 'gata' : 'nimic de făcut') };
      let token = await accessToken(k);
      if (!token) return { ...out, ok: false, mesaj: 'contul Storia trebuie conectat din nou (din Administrator CRM Kira)' };
      const call = async (method: string, path: string, body?: unknown) => {
        let a = await olx(k, method, path, token!, body);
        if (expired(a)) { token = await accessToken(k, true); if (token) a = await olx(k, method, path, token, body); }
        return a;
      };
      for (const job of pune) {
        if (Date.now() > deadline) break;
        if (await publishOne(job, call)) more = true;
        out.trimise++;
      }
      for (const job of scoate) {
        if (Date.now() > deadline) break;
        await removeOne(job, call);
        out.scoase++;
      }
      if (cere.length || verifica.length) {
        const promo = await olxPromotion(k, call);
        for (const job of cere) {
          if (Date.now() > deadline) break;
          await requestOlx(job, call, promo);
          out.olx++;
        }
        for (const job of verifica) {
          if (Date.now() > deadline) break;
          await checkOlx(job, call, promo);
          out.olx++;
        }
      }
    } catch (e) {
      if (!(e instanceof KeysRefused)) throw e;
      return { ...out, ok: false, mesaj: `OLX nu acceptă cheile aplicației (${e.message}): verifică Client ID, Client secret și API key în Administrator CRM Kira › Setări › Storia / OLX; dacă sunt corecte, conectează din nou contul Storia` };
    } finally {
      await portalDb('crm_portal_gata').catch(() => undefined);
    }
    if (!more && pune.length < 8 && scoate.length < 8 && cere.length < 8 && verifica.length < 8) break;
  }
  out.mesaj = out.mesaj || 'gata';
  return out;
}

type Call = (method: string, path: string, body?: unknown) => Promise<Answer>;
const result = (prop: string, p: Record<string, unknown>) => portalDb('crm_portal_rezultat', { p_prop: prop, p });
const olxResult = (prop: string, p: Record<string, unknown>) => portalDb('crm_portal_olx', { p_prop: prop, p });

/** Publishes or updates one advert. True when it is live, unchanged and ticked "OLX" (its export can be asked for now). */
async function publishOne(job: Job, call: Call): Promise<boolean> {
  const l = job.date || {};
  const live = !!job.uuid && !NOT_LIVE.has(job.stare || '');
  const revive = !!job.uuid && REVIVE.has(job.stare || '');
  const missing = listingProblems(l);
  if (missing.length) {
    const what = 'Lipsește: ' + missing.join(', ') + '.';
    await result(job.prop_id, live
      ? { rev: job.rev, detalii: 'Modificarea nu a plecat pe Storia. ' + what }
      : revive ? { rev: job.rev, detalii: 'Anunțul nu a pornit din nou pe Storia. ' + what }
      : { stare: 'incomplet', rev: job.rev, detalii: what });
    return false;
  }
  if (revive) {
    // The same advert starts again (its link and history stay). Storia confirms with advert_activated_success; what
    // changed meanwhile is sent after that (rev stays unset until then).
    const r = await call('POST', `/advert/v1/${encodeURIComponent(job.uuid!)}/activate`);
    if (r.status >= 200 && r.status < 300) {
      await result(job.prop_id, { stare: 'se_activeaza', rev: null, detalii: null });
      return false;
    }
    if (r.status === 0 || r.status >= 500) return false;
    // Deleted on Storia meanwhile, or Storia will not start it again: it is published as a new advert.
  }
  const advert = buildAdvert(job.prop_id, l, !!job.olx);
  const hash = advertHash(advert);
  if (live && job.hash === hash) {
    await result(job.prop_id, { rev: job.rev });
    return !!job.olx && job.stare === 'activ';
  }

  let a = live ? await call('PUT', `/advert/v1/${encodeURIComponent(job.uuid!)}`, advert) : await call('POST', '/advert/v1', advert);
  let created = !live;
  if (live && a.status === 404) {
    // Gone from Storia (deleted there by hand): publish it again.
    a = await call('POST', '/advert/v1', advert);
    created = true;
  }
  const data = (a.json.data && typeof a.json.data === 'object' ? a.json.data : {}) as Record<string, unknown>;
  const refused = String(data.last_action_status || '').toUpperCase() === 'NOT_POSTED';
  if (a.status >= 200 && a.status < 300 && !refused) {
    if (created) {
      const uuid = typeof data.uuid === 'string' ? data.uuid : null;
      await result(job.prop_id, { uuid, url: null, stare: 'se_publica', hash, rev: job.rev, detalii: null });
    } else {
      await result(job.prop_id, { stare: 'se_actualizeaza', hash, rev: job.rev, detalii: null });
    }
  } else if ((a.status >= 400 && a.status < 500) || refused) {
    const why = reason(a);
    await result(job.prop_id, created
      ? { stare: 'eroare', rev: job.rev, hash: null, detalii: 'Storia a refuzat anunțul: ' + why }
      : { rev: job.rev, hash: null, detalii: 'Storia a refuzat modificarea: ' + why });
  }
  // 5xx or no answer: nothing is written, so the next call tries again.
  return false;
}

async function removeOne(job: Removal, call: Call): Promise<void> {
  if (job.mod === 'opreste') {
    const d = await call('POST', `/advert/v1/${encodeURIComponent(job.uuid)}/deactivate`);
    if (d.status >= 200 && d.status < 300) { await result(job.prop_id, { stare: 'se_opreste', detalii: null }); return; }
    if (d.status === 404 || d.status === 410) { await result(job.prop_id, { stare: 'scos', detalii: null }); return; }
    if (d.status === 0 || d.status >= 500) return;
    // Not live on Storia (not published yet, in moderation, waiting for payment...): nothing to stop, so it is deleted.
  }
  const a = await call('DELETE', `/advert/v1/${encodeURIComponent(job.uuid)}`);
  if (a.status >= 200 && a.status < 300) await result(job.prop_id, { stare: 'se_scoate', detalii: null });
  else if (a.status === 404 || a.status === 410) await result(job.prop_id, { stare: 'scos', detalii: null });
  else if (a.status >= 400 && a.status < 500) await result(job.prop_id, { stare: 'eroare', detalii: 'Nu s-a putut scoate de pe Storia: ' + reason(a) });
}

/* ---------- OLX.ro: the export of a Storia advert (a promotion, "VAS", of the advert) ---------- */

type Promo = { code: string; days: number | null };
let promoCache: { at: number; promo: Promo | null } | null = null;

/**
 * The OLX.ro export among Storia's promotions (GET /taxonomy/v1/promotions), kept 6 hours. null: Storia has none;
 * undefined: unknown now (OLX does not answer). STORIA_OLX_PROMOTION in Vercel ("code" or "code:days") overrides it.
 */
async function olxPromotion(k: AppKeys, call: Call): Promise<Promo | null | undefined> {
  const forced = env('STORIA_OLX_PROMOTION').match(/^([\w.-]{2,80})(?::(\d{1,3}))?$/);
  if (forced) return { code: forced[1], days: forced[2] ? Number(forced[2]) : null };
  if (promoCache && Date.now() - promoCache.at < 6 * 3600_000) return promoCache.promo;
  const path = `/taxonomy/v1/promotions/${SITE_URN}`;
  let a = await olx(k, 'GET', path, null);
  if (a.status === 401 || a.status === 403) a = await call('GET', path);
  if (a.status !== 200) return undefined;
  const j = obj(a.json);
  const list = (Array.isArray(j.promotions) ? j.promotions : Array.isArray(obj(j.data).promotions) ? obj(j.data).promotions as unknown[] : []).map(obj);
  const what = (p: Obj) => `${p.promotion_code} ${p.promotion_description || ''}`;
  const types = (p: Obj) => (Array.isArray(p.account_type) ? p.account_type.map(String) : []);
  const score = (p: Obj) => (/export/i.test(what(p)) ? 2 : 0)
    + (!types(p).length || types(p).some((t) => /agen|busin|profes|compan|pro$/i.test(t)) ? 1 : 0);
  const olxOnes = list.filter((p) => typeof p.promotion_code === 'string' && /olx/i.test(what(p))).sort((x, y) => score(y) - score(x));
  const best = olxOnes[0];
  let promo: Promo | null = null;
  if (best) {
    const days = (Array.isArray(best.duration_days) ? best.duration_days : []).map(Number).filter((n) => Number.isInteger(n) && n > 0);
    promo = { code: String(best.promotion_code), days: days.length ? (days.includes(30) ? 30 : Math.max(...days)) : null };
  }
  promoCache = { at: Date.now(), promo };
  return promo;
}

const NO_SCOPE = 'Aplicația de pe OLX Group nu are încă voie să ceară exportul pe OLX (drepturile read:vas și write:vas). '
  + 'Cere-le în Application Manager (sau de la echipa OLX Group), apoi conectează din nou contul Storia din Administrator CRM Kira.';

/** Asks Storia to export the advert to OLX.ro (POST /vas/v1/advert/{uuid}). */
async function requestOlx(job: OlxJob, call: Call, promo: Promo | null | undefined): Promise<void> {
  const again = { uuid: job.uuid, stare: 'se_cere', cerut: true };
  if (promo === undefined) { await olxResult(job.prop_id, again); return; }
  if (!promo) {
    await olxResult(job.prop_id, { uuid: job.uuid, stare: 'eroare', cerut: true,
      detalii: 'Contul Storia nu are exportul pe OLX printre promovări (verifică pachetul Storia sau întreabă echipa OLX Group).' });
    return;
  }
  const body: Record<string, unknown> = { promotion_code: promo.code };
  if (promo.days) body.duration_days = promo.days;
  const a = await call('POST', `/vas/v1/advert/${encodeURIComponent(job.uuid)}`, body);
  const data = obj(a.json.data);
  if (a.status >= 200 && a.status < 300) {
    await olxResult(job.prop_id, { uuid: job.uuid, stare: 'cerut', cerut: true, detalii: null, zile: promo.days,
      vas: typeof data.vas_uuid === 'string' ? data.vas_uuid : null });
  } else if (/not ready/i.test(a.text)) {
    // Storia has not finished the advert yet: asked again in 10 minutes.
    await olxResult(job.prop_id, again);
  } else if (/already/i.test(a.text)) {
    await olxResult(job.prop_id, { uuid: job.uuid, stare: 'cerut', cerut: true, detalii: null, zile: promo.days });
  } else if (a.status === 401 || a.status === 403) {
    await olxResult(job.prop_id, { uuid: job.uuid, stare: 'eroare', cerut: true, detalii: NO_SCOPE });
  } else if (a.status >= 400 && a.status < 500) {
    await olxResult(job.prop_id, { uuid: job.uuid, stare: 'eroare', cerut: true, detalii: 'OLX nu a primit exportul: ' + reason(a) });
  } else {
    // 5xx or no answer: asked again in 10 minutes.
    await olxResult(job.prop_id, again);
  }
}

const VAS_STATE: Record<string, string> = { applied: 'activ', applied_failed: 'eroare', expired: 'expirat', removed: 'scos' };
function vasError(e: unknown): string {
  if (typeof e === 'string') return e.slice(0, 1500);
  const o = obj(e);
  return String(o.detail || o.message || o.title || (Object.keys(o).length ? JSON.stringify(o) : '')).slice(0, 1500);
}

/** An export asked for but not confirmed (the notification may not come): GET /vas/v1/advert/{uuid}. */
async function checkOlx(job: OlxCheck, call: Call, promo: Promo | null | undefined): Promise<void> {
  const a = await call('GET', `/vas/v1/advert/${encodeURIComponent(job.uuid)}`);
  if (a.status >= 200 && a.status < 300) {
    const j = obj(a.json), d = obj(j.data);
    const list = (Array.isArray(d.vas) ? d.vas : Array.isArray(j.data) ? j.data as unknown[] : Array.isArray(j.vas) ? j.vas : []).map(obj);
    const code = (v: Obj) => (typeof v.promotion_code === 'string' ? v.promotion_code : '');
    const mine = list
      .filter((v) => (job.vas ? v.uuid === job.vas : !!code(v) && (promo ? code(v) === promo.code : /olx/i.test(code(v)))))
      .sort((x, y) => String(y.created_at || '').localeCompare(String(x.created_at || '')));
    const v = mine[0];
    const st = v ? VAS_STATE[String(v.status || '').toLowerCase()] : undefined;
    if (v && st) {
      const cf = obj(v.custom_fields);
      const why = st === 'eroare' ? vasError(v.error) : '';
      await olxResult(job.prop_id, {
        uuid: job.uuid, stare: st, verificat: true, vas: typeof v.uuid === 'string' ? v.uuid : job.vas,
        detalii: st === 'eroare' ? 'OLX nu a primit exportul' + (why ? ': ' + why : '.') : null,
        ...(typeof cf.olx_url === 'string' && cf.olx_url ? { url: cf.olx_url } : {}),
        ...(typeof v.expires_at === 'string' && v.expires_at ? { expira: v.expires_at } : {}),
      });
      return;
    }
  }
  if (job.cerut && Date.now() - job.cerut > 24 * 3600_000) {
    await olxResult(job.prop_id, { uuid: job.uuid, stare: 'eroare', verificat: true,
      detalii: 'OLX nu a confirmat exportul în 24 de ore. Verifică anunțul în contul Storia, apoi „Trimite din nou pe OLX”.' });
  } else {
    await olxResult(job.prop_id, { uuid: job.uuid, verificat: true });
  }
}

/* ---------- messages for the pages and /stare-site ---------- */

/** What a database error means for the person setting things up (never repeats a key). */
export function dbMessage(code: string): string {
  if (code === 'bad_key') return 'KIRA_PORTAL_KEY din Vercel nu se potrivește cu baza: copiaz-o din nou din Administrator CRM Kira › Setări › Storia / OLX, apoi Redeploy.';
  if (code === 'old_sql') return 'Baza nu are încă tot ce trebuie pentru Storia și OLX: actualizeaz-o la versiunea 10 (Administrator CRM Kira › Setări › Baza online, sau crm-online.sql în Supabase › SQL Editor).';
  if (code === 'no_db') return 'Lipsesc KIRA_CRM_URL / KIRA_CRM_PUBLISHABLE_KEY din Vercel.';
  return 'Baza de date nu răspunde acum. Încearcă din nou peste un minut.';
}

/**
 * For /stare-site (and Administrator CRM Kira's "Verifică site-ul"): is Storia ready? Never shows a value. Besides the
 * sentences, "stare" says it in codes: cheie_site ok · lipseste · gresita · nu_se_potriveste; chei_aplicatie
 * administrator · vercel · lipsesc · sql_vechi; cont conectat · neconectat.
 */
export async function storiaStatus(): Promise<Record<string, unknown>> {
  const problem = portalKeyProblem();
  if (problem) return { setari_vercel: problem, stare: { cheie_site: env('KIRA_PORTAL_KEY') ? 'gresita' : 'lipseste' } };
  try {
    const { keys, oldSql } = await loadKeys(true);
    const c = await portalDb<{ expira: number } | null>('crm_portal_cont_get');
    const chei = keys
      ? (keys.from === 'administrator' ? 'puse din Administrator CRM Kira' : 'din Vercel (STORIA_*)')
      : oldSql ? 'rulează crm-online.sql (versiunea 10), apoi pune-le în Administrator CRM Kira › Setări › Storia / OLX'
      : 'lipsesc: le pui în Administrator CRM Kira › Setări › Storia / OLX';
    return {
      setari_vercel: 'corecte',
      chei_aplicatie: chei,
      cont_storia: c ? 'conectat' : 'neconectat: îl conectezi din Administrator CRM Kira › Setări › Storia / OLX',
      ...(c ? { export_olx: 'prin contul Storia, la proprietățile bifate „OLX” (aplicația are nevoie de read:vas și write:vas); pe OLX.ro anunțul se deschide pe Storia' } : {}),
      stare: { cheie_site: 'ok', chei_aplicatie: keys ? keys.from : oldSql ? 'sql_vechi' : 'lipsesc', cont: c ? 'conectat' : 'neconectat' },
    };
  } catch (e) {
    const code = e instanceof DbError ? e.code : '';
    return { setari_vercel: 'corecte', cont_storia: dbMessage(code), stare: { cheie_site: code === 'bad_key' ? 'nu_se_potriveste' : 'ok', baza: code || 'eroare' } };
  }
}
