import 'server-only';
import { createHash } from 'node:crypto';
import { autoTitle, crmConfig } from '@/lib/public-properties';
import { canonicalHost } from '@/lib/site-host';
import { DbError, dbMessage, portalDb, type Listing } from '@/lib/storia';

/*
 * OLX.ro directly (not through Storia) for the Kira Imobiliare CRM, over the OLX Partner API (developer.olx.ro).
 *
 * - The agency's OLX account is connected once, from Administrator CRM Kira (/api/portaluri/olx/conectare → OLX's
 *   authorization page → /api/portaluri/olx/callback).
 * - Properties ticked "OLX" and active are published, updated and taken off by runOlx(), started by the CRM apps
 *   (/api/portaluri/storia/lucreaza, together with Storia) and once a day by Vercel Cron. OLX has no notifications for
 *   this API, so the same run asks OLX about adverts still in moderation and reads new buyer messages (at most every
 *   2 minutes); a message becomes a client and an activity in the CRM (crm_olx_mesaj in crm-online.sql, version 7).
 * - OLX's real estate categories and their fields are read from the API (they differ by country and change), so a
 *   field OLX asks for that the CRM has no value for shows up in the CRM as a clear message, not a silent failure.
 *
 * The site reaches the CRM's database only through the crm_* functions, with KIRA_PORTAL_KEY; the OLX app's keys
 * (OLX_CLIENT_ID, OLX_CLIENT_SECRET) stay in Vercel. Docs: https://developer.olx.ro/docs
 */

const OLX_SITE = 'https://www.olx.ro';
const API = `${OLX_SITE}/api/partner`;
const TOKEN_URL = `${OLX_SITE}/api/open/oauth/token`;
export const OLX_AUTH_URL = `${OLX_SITE}/oauth/authorize/`;
// Must be exactly the "Redirect URI" registered for the app on developer.olx.ro.
export const OLX_REDIRECT_URI = `${canonicalHost()}/api/portaluri/olx/callback`;
const SCOPE = 'v2 read write';
const USER_AGENT = 'KiraImobiliare/1.0';

const env = (k: string) => (process.env[k] || '').trim().replace(/^(["'])(.*)\1$/, '$2').trim();
export const olxClientId = () => env('OLX_CLIENT_ID');
const VARS = ['OLX_CLIENT_ID', 'OLX_CLIENT_SECRET', 'KIRA_PORTAL_KEY'];

/** What is missing in Vercel for OLX.ro, or null. Never repeats a value. */
export function olxConfigProblem(): string | null {
  const missing = VARS.filter((k) => !env(k));
  if (missing.length) return 'lipsesc din Vercel: ' + missing.join(', ');
  if (!/^kp_[0-9a-f]{64}$/.test(env('KIRA_PORTAL_KEY'))) return 'KIRA_PORTAL_KEY nu are forma kp_… (o copiezi din Administrator CRM Kira)';
  if (!crmConfig()) return 'lipsesc KIRA_CRM_URL / KIRA_CRM_PUBLISHABLE_KEY';
  return null;
}

type Obj = Record<string, unknown>;
const obj = (v: unknown): Obj => (v && typeof v === 'object' && !Array.isArray(v) ? v as Obj : {});
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const str = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' ? String(v) : '');
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && /^-?\d+(\.\d+)?$/.test(v.trim()) ? Number(v) : null);
/** Lowercase, no diacritics, single spaces: for matching OLX's category and field names. */
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9+]+/g, ' ').trim();

/* ---------- OLX: tokens ---------- */

type Tokens = { access_token: string; refresh_token?: string; expires_in?: number };
type TokenResult = { ok: true; t: Tokens } | { ok: false; status: number; error: string };

async function tokenCall(body: Record<string, string>): Promise<TokenResult> {
  let res: Response;
  try {
    res = await fetch(TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'User-Agent': USER_AGENT },
      body: JSON.stringify({ ...body, client_id: env('OLX_CLIENT_ID'), client_secret: env('OLX_CLIENT_SECRET') }),
      cache: 'no-store',
      signal: AbortSignal.timeout(15000),
    });
  } catch {
    return { ok: false, status: 0, error: 'OLX nu răspunde' };
  }
  const text = await res.text();
  let j: Obj = {};
  try { j = obj(JSON.parse(text)); } catch { /* not JSON */ }
  if (res.ok && typeof j.access_token === 'string') return { ok: true, t: j as unknown as Tokens };
  return { ok: false, status: res.status, error: String(j.error_description || j.error || j.message || `HTTP ${res.status}`).slice(0, 300) };
}

/** The code OLX sends back to the callback, for the account's tokens. */
export async function exchangeOlxCode(code: string): Promise<TokenResult> {
  const r = await tokenCall({ grant_type: 'authorization_code', code, scope: SCOPE, redirect_uri: OLX_REDIRECT_URI });
  if (r.ok && typeof r.t.refresh_token !== 'string') return { ok: false, status: 200, error: 'OLX nu a trimis cheia de reînnoire' };
  return r;
}

type Saved = { access_token: string; refresh_token: string; expira: number; conectat?: number };

/**
 * Does the database have version 7 (accounts kept per portal)? Before it, crm_portal_cont_set keeps one account only,
 * Storia's, so OLX's tokens must never be sent to it. Throws DbError for any other database problem.
 */
export async function olxSqlReady(): Promise<boolean> {
  try {
    await portalDb('crm_portal_cont_get', { p_portal: 'olx' });
    return true;
  } catch (e) {
    if (e instanceof DbError && e.code === 'old_sql') return false;
    throw e;
  }
}

/** A valid access token for the agency's OLX account, refreshed when it expires in under 5 minutes. */
async function accessToken(force = false): Promise<string | null> {
  for (let i = 0; i < 3; i++) {
    const c = await portalDb<Saved | null>('crm_portal_cont_get', { p_portal: 'olx' });
    if (!c) return null;
    if (!force && c.expira - Date.now() > 5 * 60_000) return c.access_token;
    const r = await tokenCall({ grant_type: 'refresh_token', refresh_token: c.refresh_token });
    if (!r.ok) {
      if (r.status === 400 || r.status === 401) {
        // Refused for good (a month unused, password changed, app disconnected), unless someone refreshed it meanwhile.
        const now = await portalDb<Saved | null>('crm_portal_cont_get', { p_portal: 'olx' });
        if (now && now.refresh_token !== c.refresh_token) { force = false; continue; }
        await portalDb('crm_portal_cont_sterge', { p_portal: 'olx' });
        return null;
      }
      throw new Error('OLX token: ' + r.error);
    }
    // OLX gives a new refresh token at most once a day; without one, the old one stays valid.
    const t = { ...r.t, refresh_token: r.t.refresh_token || c.refresh_token };
    const saved = await portalDb<{ ok: boolean }>('crm_portal_cont_set', { p: { ...t, vechi: c.refresh_token, portal: 'olx' } });
    if (saved?.ok) return t.access_token;
    force = false;
  }
  return null;
}

// The app's own token (no account): categories, their fields and locations are the same for everybody.
let appToken: { token: string; until: number } | null = null;
async function clientToken(): Promise<string | null> {
  if (appToken && appToken.until > Date.now()) return appToken.token;
  const r = await tokenCall({ grant_type: 'client_credentials', scope: SCOPE });
  if (!r.ok) return null;
  appToken = { token: r.t.access_token, until: Date.now() + Math.max(60, Math.min(r.t.expires_in ?? 3600, 86400) - 120) * 1000 };
  return appToken.token;
}

/* ---------- OLX: requests ---------- */

export type Answer = { status: number; json: unknown; text: string };

async function request(method: string, path: string, token: string, body?: unknown): Promise<Answer> {
  try {
    const res = await fetch(`${API}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`, Version: '2.0', Accept: 'application/json', 'User-Agent': USER_AGENT,
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      cache: 'no-store',
      signal: AbortSignal.timeout(20000),
    });
    const text = await res.text();
    let json: unknown = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { status: res.status, json, text: text.slice(0, 2000) };
  } catch {
    return { status: 0, json: null, text: 'OLX nu răspunde' };
  }
}

/** The payload: OLX wraps most answers in {"data": …}. */
const dataOf = (a: Answer): unknown => {
  const j = a.json;
  return j && typeof j === 'object' && !Array.isArray(j) && 'data' in (j as Obj) ? (j as Obj).data : j;
};
const good = (a: Answer) => a.status >= 200 && a.status < 300;

/** OLX's reason for a refusal, readable in the CRM: "field: what is wrong; …". */
export function olxReason(a: Answer): string {
  const j = obj(a.json), err = obj(j.error);
  const v = arr(err.validation).length ? arr(err.validation) : arr(j.validation);
  if (v.length) {
    return v.map((x) => {
      const o = obj(x), what = str(o.detail) || str(o.title) || str(o.message);
      return [str(o.field), what].filter(Boolean).join(': ') || JSON.stringify(x);
    }).join('; ').slice(0, 1500);
  }
  return String(str(err.detail) || str(err.title) || str(j.message) || str(j.error_description) || str(j.error) || a.text || `HTTP ${a.status}`).slice(0, 1500);
}

type Call = (method: string, path: string, body?: unknown) => Promise<Answer>;

/* ---------- OLX's real estate categories and their fields ---------- */

type Cat = { id: number; name: string; parent: number | null; leaf: boolean; photos: number; path: string };
export type Attr = {
  code: string; label: string; unit?: string | null;
  validation?: { type?: string; required?: boolean; numeric?: boolean; min?: number | null; max?: number | null; allow_multiple_values?: boolean };
  values?: { code: string; label: string }[];
};

const HOURS6 = 6 * 3600_000;
let taxonomy: { at: number; leaves: Cat[] } | null = null;
const attrCache = new Map<number, { at: number; list: Attr[] }>();
const placeCache = new Map<string, { city_id: number; district_id?: number }>();

const toCat = (v: unknown): Cat | null => {
  const o = obj(v), id = num(o.id);
  if (id == null) return null;
  return { id, name: str(o.name), parent: num(o.parent_id) || null, leaf: o.is_leaf === true, photos: num(o.photos_limit) ?? 0, path: str(o.name) };
};

/** Every category under "Imobiliare", with its path ("Imobiliare › Apartamente - Garsoniere de vanzare"). */
async function realEstate(get: Call): Promise<Cat[]> {
  if (taxonomy && Date.now() - taxonomy.at < HOURS6 && taxonomy.leaves.length) return taxonomy.leaves;
  const first = await get('GET', '/categories');
  if (!good(first)) throw new BuildError('OLX nu a dat lista de categorii: ' + olxReason(first));
  const all = arr(dataOf(first)).map(toCat).filter((c): c is Cat => !!c);
  const root = all.find((c) => !c.parent && /^imobiliare\b/.test(norm(c.name))) || all.find((c) => /^imobiliare\b/.test(norm(c.name)));
  if (!root) throw new BuildError('OLX nu are categoria Imobiliare în lista primită');
  const byParent = new Map<number, Cat[]>();
  for (const c of all) if (c.parent) byParent.set(c.parent, [...(byParent.get(c.parent) || []), c]);
  const out: Cat[] = [];
  let calls = 0;
  const walk = async (c: Cat, depth: number): Promise<void> => {
    let kids = byParent.get(c.id) || [];
    if (!kids.length && !c.leaf && depth < 4 && calls < 40) {
      calls++;
      const a = await get('GET', `/categories?parent_id=${c.id}`);
      kids = good(a) ? arr(dataOf(a)).map(toCat).filter((k): k is Cat => !!k && k.id !== c.id) : [];
    }
    if (!kids.length) { if (c !== root) out.push(c); return; }
    for (const k of kids) { k.path = `${c.path} › ${k.name}`; await walk(k, depth + 1); }
  };
  root.path = root.name;
  await walk(root, 0);
  if (!out.length) throw new BuildError('OLX nu are subcategorii la Imobiliare');
  taxonomy = { at: Date.now(), leaves: out };
  return out;
}

// CRM type → words in OLX's category names (checked by name, since the ids differ by country).
const FAMILY: Record<string, 'ap' | 'casa' | 'teren' | 'sp'> = {
  'Apartament': 'ap', 'Garsonieră': 'ap', 'Casă / Vilă': 'casa', 'Teren': 'teren',
  'Spațiu comercial': 'sp', 'Birou': 'sp', 'Spațiu industrial': 'sp',
};
const KIND: Record<string, RegExp[]> = {
  'Apartament': [/apartament|garsonier/], 'Garsonieră': [/garsonier|apartament/],
  'Casă / Vilă': [/\bcase\b|\bcasa\b|\bvil/], 'Teren': [/teren/],
  'Spațiu comercial': [/spatii comerciale|spatiu comercial|comercial/], 'Birou': [/birou/, /comercial/],
  'Spațiu industrial': [/industrial|\bhal|depozit/, /comercial/],
};
const SALE = /vanzare|vand\b|de vanzare/, RENT = /inchiri|chirie/;

/** The OLX category for this property, or null. Exported for the test. */
export function pickCategory(leaves: Cat[], tip: string, sale: boolean): Cat | null {
  const kinds = KIND[tip] || [];
  for (const kind of kinds) {
    const scored = leaves.map((c) => {
      const p = norm(c.path), name = norm(c.name);
      if (!kind.test(p)) return null;
      const other = sale ? RENT : SALE, mine = sale ? SALE : RENT;
      if (other.test(p) && !mine.test(p)) return null;
      return { c, s: (kind.test(name) ? 10 : 5) + (mine.test(p) ? 5 : 0) };
    }).filter((x): x is { c: Cat; s: number } => !!x).sort((a, b) => b.s - a.s);
    if (scored.length) return scored[0].c;
  }
  return null;
}

async function attributesOf(cat: Cat, get: Call): Promise<Attr[]> {
  const hit = attrCache.get(cat.id);
  if (hit && Date.now() - hit.at < HOURS6) return hit.list;
  const a = await get('GET', `/categories/${cat.id}/attributes`);
  if (!good(a)) throw new BuildError('OLX nu a dat câmpurile categoriei: ' + olxReason(a));
  const list = arr(dataOf(a)).map((x) => {
    const o = obj(x);
    return {
      code: str(o.code), label: str(o.label) || str(o.code), unit: str(o.unit) || null,
      validation: obj(o.validation) as Attr['validation'],
      values: arr(o.values).map((v) => ({ code: str(obj(v).code), label: str(obj(v).label) || str(obj(v).code) })).filter((v) => v.code),
    } as Attr;
  }).filter((x) => x.code);
  attrCache.set(cat.id, { at: Date.now(), list });
  return list;
}

/* ---------- a CRM property as an OLX advert ---------- */

export class BuildError extends Error {}

const pos = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : null);
const roomsOf = (l: Listing) => pos(l.camere) ?? (l.tip === 'Garsonieră' ? 1 : null);
type Full = Listing & { etaj?: number; etajeTotal?: number; an?: number; material?: string; stare?: string; incalzire?: string; particularitati?: string[] };

/** What the CRM must fill before the advert can go to OLX (the CRM shows the same list). Empty when ready. */
export function olxProblems(l: Listing): string[] {
  const fam = FAMILY[l.tip || ''];
  if (!fam) return [`tipul „${l.tip || 'fără tip'}” nu se publică automat pe OLX`];
  const p: string[] = [];
  if ((l.descriere || '').trim().length < 80) p.push('descrierea anunțului (cel puțin 80 de caractere)');
  if (!pos(l.pret)) p.push('prețul');
  if (!l.geo || typeof l.geo.lat !== 'number' || typeof l.geo.lng !== 'number') p.push('pinul pe hartă (la Locație)');
  if (!(l.poze || []).length) p.push('cel puțin o poză');
  if ((fam === 'ap' || fam === 'casa') && !roomsOf(l)) p.push('numărul de camere');
  if (fam !== 'teren' && !pos(l.suprafata)) p.push('suprafața utilă');
  if (fam === 'casa' && !pos(l.suprafataTeren)) p.push('suprafața terenului');
  if (fam === 'teren' && !pos(l.suprafataTeren) && !pos(l.suprafata)) p.push('suprafața terenului');
  return p;
}

/** OLX refuses phone numbers, emails and links in the title and description, and long runs of !!!, ..., ---. */
export function cleanText(s: string): string {
  let t = s.replace(/\r/g, '')
    .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '')
    .replace(/\b(?:https?:\/\/|www\.)\S+/gi, '')
    .replace(/(?:\+|00)?\d[\d\s()./-]{7,}\d/g, (m) => (m.replace(/\D/g, '').length >= 9 ? '' : m))
    .replace(/([!?.,\-=+#%&@*_><:()|])\1{2,}/g, (_m, c: string) => (c === '.' ? '…' : c))
    .replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  const letters = t.replace(/[^A-Za-zĂÂÎȘȚăâîșțŞŢşţ]/g, '');
  const caps = letters.replace(/[^A-ZĂÂÎȘȚŞŢ]/g, '').length;
  if (letters.length > 10 && caps / letters.length > 0.5) {
    t = t.toLowerCase().replace(/(^|[.!?…]\s+|\n)(\p{L})/gu, (_m, a: string, b: string) => a + b.toUpperCase());
  }
  return t;
}

function cut(s: string, n: number): string {
  s = s.replace(/\s+/g, ' ').trim();
  if (s.length <= n) return s;
  const c = s.slice(0, n + 1), i = c.lastIndexOf(' ');
  return (i > n * 0.6 ? c.slice(0, i) : s.slice(0, n)).replace(/[\s,.;:–-]+$/, '');
}

export function olxTitle(l: Listing): string {
  const sale = l.tranzactie !== 'inchiriere';
  let t = cleanText((l.titlu || '').trim()) || autoTitle({
    tip: l.tip || null, camere: l.camere ?? null, suprafata: l.suprafata ?? null, tranzactie: l.tranzactie || null,
    zona: l.zona || null, localitate: l.localitate || null,
  });
  t = t.replace(/\s+/g, ' ').trim();
  if (t.length < 16 && l.localitate && !t.includes(l.localitate)) t = `${t}, ${l.localitate}`;
  if (t.length < 16) t = `${t} ${sale ? 'de vânzare' : 'de închiriat'}`;
  return cut(t, 150);
}

// Numbers in an OLX value's name: "2 camere" → [2, 2], "1977 - 1990" → [1977, 1990], "Peste 10" → [11, ∞), "Parter" → [0, 0].
function span(label: string): [number, number] | null {
  // Like norm(), but keeping the dash of "1977 - 1990".
  const n = label.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (/\bparter\b/.test(n)) return [0, 0];
  if (/\b(demisol|subsol)\b/.test(n)) return [-1, -1];
  if (/\bmansarda\b/.test(n)) return [100, 100];
  let m = /(\d+)\s*[-–]\s*(\d+)/.exec(n);
  if (m) return [Number(m[1]), Number(m[2])];
  m = /\b(inainte de|sub|mai putin de)\s*(\d+)/.exec(n);
  if (m) return [-Infinity, Number(m[2]) - 1];
  m = /\b(pana (in|la))\s*(\d+)/.exec(n);
  if (m) return [-Infinity, Number(m[3])];
  m = /\b(dupa|peste|mai mult de)\s*(\d+)/.exec(n);
  if (m) return [Number(m[2]) + 1, Infinity];
  m = /(\d+)\D*?(\+|sau mai mult|si mai mult|si peste|sau peste)/.exec(n);
  if (m) return [Number(m[1]), Infinity];
  m = /^\D*(\d+)\D*$/.exec(n);
  if (m) return [Number(m[1]), Number(m[1])];
  return null;
}

function pickNumber(values: { code: string; label: string }[], v: number): string | null {
  let best: { code: string; w: number } | null = null;
  for (const o of values) {
    const s = span(o.label);
    if (!s || v < s[0] || v > s[1]) continue;
    const w = s[1] - s[0];
    if (!best || w < best.w) best = { code: o.code, w };
  }
  return best ? best.code : null;
}

function pickText(values: { code: string; label: string }[], wanted: string[]): string | null {
  const w = wanted.map(norm).filter(Boolean);
  for (const x of w) { const o = values.find((v) => norm(v.label) === x || norm(v.code) === x); if (o) return o.code; }
  for (const x of w) { const o = values.find((v) => norm(v.label).includes(x) || (norm(v.label).length > 3 && x.includes(norm(v.label)))); if (o) return o.code; }
  return null;
}

/**
 * OLX's fields for the category, filled from the property: [attributes, the required ones the CRM cannot fill].
 * Fields are recognised by name ("Suprafata utila", "Etaj", "An constructie"…); unknown optional ones are left out.
 */
export function fillAttributes(attrs: Attr[], l: Full): { attributes: { code: string; value?: string; values?: string[] }[]; missing: string[] } {
  const fam = FAMILY[l.tip || ''];
  const out: { code: string; value?: string; values?: string[] }[] = [];
  const missing: string[] = [];
  for (const a of attrs) {
    const vt = a.validation || {};
    if (vt.type === 'price' || vt.type === 'salary' || a.code === 'price') continue;
    const n = norm(`${a.code} ${a.label}`);
    const opts = a.values || [];
    let v: number | string[] | null = null;
    if (/teren/.test(n) && /suprafat|\bmp\b|\bm2\b|area/.test(n)) v = pos(l.suprafataTeren) ?? (fam === 'teren' ? pos(l.suprafata) : null);
    else if (/suprafat|\bm2\b|area|\bmp\b/.test(n) || a.code === 'm') v = fam === 'teren' ? (pos(l.suprafataTeren) ?? pos(l.suprafata)) : pos(l.suprafata);
    else if (/camer|\brooms?\b/.test(n)) v = roomsOf(l);
    else if (/\betaje\b|nr etaj|numar (de )?etaj|regim (de )?inaltime|total floors/.test(n)) v = pos(l.etajeTotal);
    else if (/\betaj\b|\bfloor\b/.test(n)) v = typeof l.etaj === 'number' ? l.etaj : null;
    else if (/\ban (de )?constr|\bconstructie\b|\byear\b|vechime/.test(n) && !/material|tip constr|structur/.test(n)) v = pos(l.an);
    else if (/persoana fizica|\bfirma\b|vanzator|private|business|oferit de|tip (anunt|ofertant)/.test(n)) v = ['Firma', 'Agentie', 'Agentie imobiliara', 'Companie', 'Business', 'Profesionist'];
    else if (/material|structura/.test(n)) v = l.material ? [l.material] : null;
    else if (/\bstare\b|finisaj/.test(n)) v = l.stare ? [l.stare] : null;
    else if (/incalzire|termic|heating/.test(n)) v = l.incalzire ? [l.incalzire] : null;
    else if (/mobilat|furnish/.test(n)) v = (l.particularitati || []).includes('Mobilat') ? ['Mobilat'] : null;

    let value: string | null = null;
    if (v != null) {
      if (!opts.length) {
        if (typeof v === 'number') {
          if (v === 100 && /\betaj\b|\bfloor\b/.test(n)) value = null;
          else if (vt.numeric !== false && ((vt.min != null && v < vt.min) || (vt.max != null && v > vt.max))) value = null;
          else value = String(Math.round(v));
        } else value = v[0];
      } else value = typeof v === 'number' ? pickNumber(opts, v) : pickText(opts, v);
    }
    if (value == null && vt.required && opts.length === 1) value = opts[0].code;
    if (value == null) { if (vt.required) missing.push(a.label || a.code); continue; }
    out.push(vt.allow_multiple_values ? { code: a.code, values: [value] } : { code: a.code, value });
  }
  return { attributes: out, missing };
}

/** The advert for POST/PUT /adverts. Only the listing: never the street, the number, the owner or the notes. */
export async function buildOlxAdvert(propId: string, l: Full, get: Call): Promise<Record<string, unknown>> {
  const sale = l.tranzactie !== 'inchiriere';
  const cat = pickCategory(await realEstate(get), l.tip || '', sale);
  if (!cat) throw new BuildError(`nu găsesc pe OLX categoria pentru „${l.tip}” ${sale ? 'de vânzare' : 'de închiriat'}`);
  const { attributes, missing } = fillAttributes(await attributesOf(cat, get), l);
  if (missing.length) throw new BuildError(`OLX cere la „${cat.name}”: ${missing.join(', ')} (nu sunt în CRM sau nu se potrivesc cu variantele OLX)`);
  const description = cleanText(l.descriere || '').slice(0, 9000);
  if (description.length < 80) throw new BuildError('descrierea are sub 80 de caractere fără telefoane, emailuri și linkuri (OLX nu le acceptă)');
  const g = l.geo!;
  const key = `${g.lat.toFixed(5)},${g.lng.toFixed(5)}`;
  let place = placeCache.get(key);
  if (!place) {
    const a = await get('GET', `/locations?latitude=${g.lat.toFixed(6)}&longitude=${g.lng.toFixed(6)}`);
    if (!good(a)) throw new BuildError('OLX nu a găsit localitatea pinului: ' + olxReason(a));
    const first = arr(dataOf(a)).map(obj).find((x) => num(obj(x.city).id) != null);
    if (!first) throw new BuildError('OLX nu găsește o localitate la pinul de pe hartă');
    place = { city_id: num(obj(first.city).id)! };
    const d = num(obj(first.district).id);
    if (d != null) place.district_id = d;
    placeCache.set(key, place);
  }
  const photos = (l.poze || []).slice(0, cat.photos > 0 ? cat.photos : 8);
  return {
    title: olxTitle(l),
    description,
    category_id: cat.id,
    advertiser_type: 'business',
    external_id: propId,
    contact: { name: 'Kira Imobiliare' },
    location: { ...place, latitude: g.lat, longitude: g.lng },
    images: photos.map((id) => ({ url: `${canonicalHost()}/poze/${id}` })),
    price: { value: Math.round(l.pret || 0), currency: 'EUR', negotiable: false },
    attributes,
  };
}

const advertHash = (a: Record<string, unknown>) => createHash('sha256').update(JSON.stringify(a)).digest('hex').slice(0, 40);

/* ---------- advert states ---------- */

// OLX advert status → the CRM's words (the same as for Storia).
const STATE: Record<string, string> = {
  new: 'se_publica', active: 'activ', limited: 'neplatit', unpaid: 'neplatit', unconfirmed: 'in_moderare',
  removed_by_user: 'scos', outdated: 'expirat', moderated: 'refuzat', blocked: 'blocat', disabled: 'blocat', removed_by_moderator: 'refuzat',
};
const DETAIL: Record<string, string> = {
  limited: 'OLX cere plată: contul a trecut de anunțurile gratuite din această categorie. Cumperi un pachet în contul OLX, activezi anunțul acolo, apoi apeși „Trimite din nou”.',
  unpaid: 'Anunțul așteaptă plata în contul OLX.',
  unconfirmed: 'OLX așteaptă confirmarea anunțului în contul OLX.',
  disabled: 'OLX a oprit anunțul până îl verifică.',
};
const LIVE = new Set(['activ', 'se_publica', 'se_actualizeaza', 'in_moderare', 'neplatit', 'blocat']);

async function stateOf(id: string, status: string, call: Call): Promise<{ stare: string; detalii: string | null }> {
  const stare = STATE[status] || 'se_publica';
  let detalii = DETAIL[status] || null;
  if (status === 'moderated' || status === 'removed_by_moderator' || status === 'blocked') {
    const r = await call('GET', `/adverts/${encodeURIComponent(id)}/moderation-reason`);
    const d = obj(dataOf(r));
    const why = good(r) ? str(d.reason) || str(d.description) || str(d.message) || str(d.title) : '';
    detalii = 'OLX a respins anunțul la verificare' + (why ? ': ' + why.slice(0, 500) : '.');
  }
  return { stare, detalii };
}

/* ---------- the worker ---------- */

type Job = { prop_id: string; rev: number; date: Full; uuid: string | null; stare: string | null; hash: string | null };
type Removal = { prop_id: string; uuid: string; stare: string; vandut?: boolean };
type Check = { prop_id: string; uuid: string; stare: string };
// activ: the OLX account is connected (the CRM apps then ask every few minutes, so messages come in without waiting).
export type OlxResult = { ok: boolean; activ: boolean; mesaj: string; trimise: number; scoase: number; verificate: number; mesaje: number };
const result = (prop: string, p: Record<string, unknown>) => portalDb('crm_portal_rezultat', { p_prop: prop, p: { ...p, portal: 'olx' } });

/** Does what the CRM asks of OLX.ro and reads new messages (at most ~45 seconds; the rest at the next call). */
export async function runOlx(): Promise<OlxResult> {
  const out: OlxResult = { ok: true, activ: false, mesaj: '', trimise: 0, scoase: 0, verificate: 0, mesaje: 0 };
  const problem = olxConfigProblem();
  if (problem) return { ...out, ok: false, mesaj: problem };
  const deadline = Date.now() + 45_000;
  for (let round = 0; round < 6 && Date.now() < deadline; round++) {
    const w = await portalDb<{ ocupat?: boolean; conectat?: boolean; conectat_la?: number; pune?: Job[]; scoate?: Removal[]; verifica?: Check[]; mesaje?: boolean }>('crm_olx_lucru');
    if (w?.ocupat) return { ...out, activ: true, mesaj: out.mesaj || 'altă trecere e în lucru' };
    if (!w?.conectat) return { ...out, activ: false, mesaj: 'contul OLX nu e conectat' };
    out.activ = true;
    const pune = w.pune || [], scoate = w.scoate || [], verifica = w.verifica || [];
    try {
      if (!pune.length && !scoate.length && !verifica.length && !w.mesaje) return { ...out, mesaj: out.mesaj || 'nimic de făcut' };
      let token = await accessToken();
      if (!token) return { ...out, ok: false, activ: false, mesaj: 'contul OLX trebuie conectat din nou (din Administrator CRM Kira)' };
      const call: Call = async (method, path, body) => {
        let a = await request(method, path, token!, body);
        if (a.status === 401) { token = await accessToken(true); if (token) a = await request(method, path, token, body); }
        return a;
      };
      // Categories, their fields and places: with the app's own token, or the account's if OLX wants that.
      const get: Call = async (method, path, body) => {
        const t = await clientToken();
        const a = t ? await request(method, path, t, body) : null;
        return a && a.status !== 401 && a.status !== 403 ? a : call(method, path, body);
      };
      for (const job of pune) {
        if (Date.now() > deadline) break;
        await publishOne(job, call, get);
        out.trimise++;
      }
      for (const job of scoate) {
        if (Date.now() > deadline) break;
        await removeOne(job, call);
        out.scoase++;
      }
      for (const job of verifica) {
        if (Date.now() > deadline) break;
        await checkOne(job, call);
        out.verificate++;
      }
      if (w.mesaje && Date.now() < deadline) out.mesaje += await readMessages(w.conectat_la || 0, deadline, call);
    } finally {
      await portalDb('crm_olx_gata').catch(() => undefined);
    }
    if (pune.length < 8 && scoate.length < 8) break;
  }
  out.mesaj = out.mesaj || 'gata';
  return out;
}

async function publishOne(job: Job, call: Call, get: Call): Promise<void> {
  const l = job.date || {};
  const live = !!job.uuid && LIVE.has(job.stare || '');
  const missing = olxProblems(l);
  if (missing.length) {
    const what = 'Lipsește: ' + missing.join(', ') + '.';
    await result(job.prop_id, live ? { rev: job.rev, detalii: 'Modificarea nu a plecat pe OLX. ' + what } : { stare: 'incomplet', rev: job.rev, detalii: what });
    return;
  }
  let advert: Record<string, unknown>;
  try {
    advert = await buildOlxAdvert(job.prop_id, l, get);
  } catch (e) {
    if (!(e instanceof BuildError)) throw e;
    await result(job.prop_id, live ? { rev: job.rev, detalii: 'Modificarea nu a plecat pe OLX: ' + e.message + '.' } : { stare: 'eroare', rev: job.rev, hash: null, detalii: 'Nu pot pregăti anunțul pentru OLX: ' + e.message + '.' });
    return;
  }
  const hash = advertHash(advert);
  if (live && job.hash === hash) { await result(job.prop_id, { rev: job.rev }); return; }

  if (job.uuid) {
    const id = encodeURIComponent(job.uuid);
    const a = await call('PUT', `/adverts/${id}`, advert);
    if (good(a)) {
      let status = str(obj(dataOf(a)).status);
      let note: string | null = null;
      // Taken off or expired on OLX, and ticked again in the CRM: the same advert is activated again.
      if (!live || status === 'removed_by_user' || status === 'outdated') {
        const act = await call('POST', `/adverts/${id}/commands`, { command: 'activate' });
        if (!good(act) && act.status >= 400 && act.status < 500) note = 'OLX nu a activat anunțul: ' + olxReason(act);
        const g = await call('GET', `/adverts/${id}`);
        if (good(g)) status = str(obj(dataOf(g)).status) || status;
      }
      const ad = obj(dataOf(a)), st = await stateOf(job.uuid, status, call);
      await result(job.prop_id, { stare: st.stare, url: str(ad.url) || undefined, hash, rev: job.rev, detalii: note || st.detalii });
      return;
    }
    if (a.status !== 404) {
      if (a.status >= 400 && a.status < 500) {
        await result(job.prop_id, live
          ? { rev: job.rev, hash: null, detalii: 'OLX a refuzat modificarea: ' + olxReason(a) }
          : { stare: 'eroare', rev: job.rev, hash: null, detalii: 'OLX a refuzat anunțul: ' + olxReason(a) });
      }
      return; // 5xx or no answer: nothing is written, so the next call tries again.
    }
    // Gone from OLX (deleted there by hand): published again as a new advert.
  }
  const a = await call('POST', '/adverts', advert);
  if (good(a)) {
    const ad = obj(dataOf(a)), id = str(ad.id);
    const st = await stateOf(id, str(ad.status), call);
    await result(job.prop_id, { uuid: id || null, url: str(ad.url) || null, stare: st.stare, hash, rev: job.rev, detalii: st.detalii });
  } else if (a.status >= 400 && a.status < 500) {
    await result(job.prop_id, { uuid: null, url: null, stare: 'eroare', rev: job.rev, hash: null, detalii: 'OLX a refuzat anunțul: ' + olxReason(a) });
  }
}

async function removeOne(job: Removal, call: Call): Promise<void> {
  const id = encodeURIComponent(job.uuid);
  const a = await call('POST', `/adverts/${id}/commands`, { command: 'deactivate', is_success: !!job.vandut });
  if (good(a) || a.status === 404) { await result(job.prop_id, { stare: 'scos', detalii: null }); return; }
  if (a.status < 400 || a.status >= 500) return;
  // Not active (expired, waiting for payment, refused…): nothing is shown on OLX, or it is closed another way.
  const g = await call('GET', `/adverts/${id}`);
  const status = good(g) ? str(obj(dataOf(g)).status) : '';
  if (g.status === 404 || ['removed_by_user', 'outdated', 'moderated', 'removed_by_moderator', 'blocked', 'disabled'].includes(status)) {
    await result(job.prop_id, { stare: 'scos', detalii: null });
    return;
  }
  if (status === 'limited') {
    const f = await call('POST', `/adverts/${id}/commands`, { command: 'finish' });
    if (good(f)) { await result(job.prop_id, { stare: 'scos', detalii: null }); return; }
  }
  await result(job.prop_id, { stare: 'eroare', detalii: 'Nu s-a putut scoate de pe OLX: ' + olxReason(a) });
}

async function checkOne(job: Check, call: Call): Promise<void> {
  const g = await call('GET', `/adverts/${encodeURIComponent(job.uuid)}`);
  if (g.status === 404) { await result(job.prop_id, { sterge: true }); return; } // gone: published again next time
  if (!good(g)) return;
  const ad = obj(dataOf(g)), st = await stateOf(job.uuid, str(ad.status), call);
  await result(job.prop_id, { stare: st.stare, url: str(ad.url) || undefined, detalii: st.detalii });
}

/* ---------- buyers' messages ---------- */

/** "2026-11-22 10:15:00" (OLX, no zone) → ISO in UTC. */
function iso(v: unknown): string | null {
  const s = str(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2})?$/.test(s)) return s.replace(' ', 'T') + 'Z';
  return s;
}
export function findPhone(text: string): string | null {
  const m = /(?:\+?40|0040|\b0)[\s.-]?7\d{2}[\s.-]?\d{3}[\s.-]?\d{3}\b/.exec(text);
  return m ? m[0].trim() : null;
}
export function findEmail(text: string): string | null {
  const m = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/.exec(text);
  return m ? m[0] : null;
}

type Thread = { uuid: string; total: number; creat: string | null; advert: string; who: string };

async function readMessages(conectatLa: number, deadline: number, call: Call): Promise<number> {
  const threads: Thread[] = [];
  for (let off = 0; off < 300; off += 100) {
    const a = await call('GET', `/threads?limit=100&offset=${off}`);
    if (!good(a)) break;
    const list = arr(dataOf(a)).map(obj);
    for (const t of list) {
      const uuid = str(t.uuid) || str(t.id);
      if (uuid) threads.push({ uuid, total: num(t.total_count) ?? 0, creat: iso(t.created_at), advert: str(t.advert_id), who: str(t.interlocutor_id) });
    }
    if (list.length < 100) break;
  }
  if (!threads.length) return 0;
  const toRead = await portalDb<string[]>('crm_olx_fire', { p: threads.map((t) => ({ uuid: t.uuid, total: t.total, creat: t.creat })) });
  const names = new Map<string, string>();
  let n = 0;
  for (const uuid of toRead || []) {
    if (Date.now() > deadline) break;
    const t = threads.find((x) => x.uuid === uuid);
    if (!t) continue;
    const a = await call('GET', `/threads/${encodeURIComponent(uuid)}/messages`);
    if (!good(a)) continue;
    const since = conectatLa - 24 * 3600_000;
    const msgs = arr(dataOf(a)).map(obj)
      .filter((m) => str(m.type) === 'received' && (str(m.uuid) || str(m.id)))
      .filter((m) => { const d = Date.parse(iso(m.created_at) || ''); return !Number.isFinite(d) || d >= since; })
      .sort((x, y) => (iso(x.created_at) || '').localeCompare(iso(y.created_at) || ''));
    let done = true;
    if (msgs.length && t.who && !names.has(t.who)) {
      const u = await call('GET', `/users/${encodeURIComponent(t.who)}`);
      names.set(t.who, good(u) ? str(obj(dataOf(u)).name).slice(0, 80) : '');
    }
    for (const m of msgs) {
      const text = str(m.text).trim() || (arr(m.attachments).length ? '(a trimis un fișier pe OLX)' : '');
      try {
        const r = await portalDb<{ ok?: boolean; nou?: boolean; duplicat?: boolean; vechi?: boolean }>('crm_olx_mesaj', {
          m: {
            uuid: str(m.uuid) || `${uuid}-${str(m.id)}`, created_at: iso(m.created_at), conversation_id: `olx:${uuid}`,
            ad_id: t.advert || null, sender_name: names.get(t.who) || null, sender_phone: findPhone(text), sender_email: findEmail(text),
            message: text.slice(0, 2000),
          },
        });
        if (r && !r.duplicat && !r.vechi) n++;
      } catch {
        done = false;
        break;
      }
    }
    if (done) await portalDb('crm_olx_fir_ok', { p_fir: uuid, p_total: t.total }).catch(() => undefined);
  }
  return n;
}

/* ---------- for /stare-site ---------- */

/** Are the Vercel settings and the OLX account in order? Never shows a value. */
export async function olxStatus(): Promise<Record<string, string>> {
  const problem = olxConfigProblem();
  if (problem) return { setari_vercel: problem };
  try {
    const c = await portalDb<Saved | null>('crm_portal_cont_get', { p_portal: 'olx' });
    return { setari_vercel: 'corecte', cont_olx: c ? 'conectat' : 'neconectat: îl conectezi din Administrator CRM Kira › Setări › OLX.ro' };
  } catch (e) {
    const code = e instanceof DbError ? e.code : '';
    return { setari_vercel: 'corecte', cont_olx: code === 'old_sql' ? 'Baza nu are încă partea de OLX.ro: rulează crm-online.sql (versiunea 7) în Supabase › SQL Editor.' : dbMessage(code) };
  }
}
