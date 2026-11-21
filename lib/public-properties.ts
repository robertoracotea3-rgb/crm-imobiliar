import 'server-only';
import { cache } from 'react';

/*
 * Proprietățile de pe site vin din Kira Imobiliare (CRM-ul): apar cele bifate „Site Kira” la Promovare,
 * cât timp au statusul Activă. Site-ul le citește din baza online a CRM-ului (Supabase) cu cheia publică
 * (publishable), prin funcția crm_site_properties(), care dă doar textul anunțului: niciodată strada,
 * numărul, proprietarul, notele, clienții sau contractele. Pozele trec prin /poze/<id> (app/poze/[id]/route.ts).
 *
 * Variabile în Vercel (Settings > Environment Variables):
 *   KIRA_CRM_URL               adresa proiectului, de forma https://abcdefghijklmnop.supabase.co
 *   KIRA_CRM_PUBLISHABLE_KEY   cheia publică (sb_publishable_...). Cheia secretă / service_role e refuzată.
 */

export type PublicFact = { label: string; value: string };

export type PublicProperty = {
  id: string; internal_code: string | null; title: string; description: string | null; price: number | null;
  currency: string | null; category: string | null; transaction: string | null;
  city: string | null; county: string | null; zone: string | null;
  surface_useful: number | null; surface_built: number | null; surface_land: number | null;
  attributes: Record<string, unknown>;
  /** The property type exactly as the CRM writes it (Apartament, Casă / Vilă, Spațiu industrial…). */
  type_label: string | null;
  /** Characteristics for the property page, in display order, only the filled-in ones. */
  facts: PublicFact[];
  /** Balcon, Lift, Internet… (from the CRM's ticked lists). */
  features: string[];
  /** When the CRM last changed the property (ms). */
  updated_at: number | null;
};

type CrmSiteRow = Record<string, unknown> & { id: string };

const CATEGORY: Record<string, string> = {
  'Apartament': 'apartament', 'Garsonieră': 'garsoniera', 'Casă / Vilă': 'casa_vila', 'Teren': 'teren',
  'Spațiu comercial': 'spatiu_comercial', 'Birou': 'birou', 'Spațiu industrial': 'hala', 'Cameră': 'camera',
};

function isPublicKey(key: string): boolean {
  if (/^sb_secret_/i.test(key)) return false;
  if (/^sb_publishable_/i.test(key)) return true;
  // Older projects: the anon JWT. A service_role JWT never goes on the public site.
  const part = key.split('.')[1];
  if (!part) return false;
  try { return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))?.role === 'anon'; } catch { return false; }
}

/** The CRM's online database, or null when it is not set up (the pages then render without listings). */
export function crmConfig(): { url: string; key: string } | null {
  const url = (process.env.KIRA_CRM_URL || '').trim().replace(/\/+$/, '').replace(/\/(rest|storage|auth)\/v1(\/.*)?$/, '');
  const key = (process.env.KIRA_CRM_PUBLISHABLE_KEY || '').trim();
  const okUrl = /^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(url) ||
    (process.env.NODE_ENV !== 'production' && /^http:\/\/(localhost|127\.0\.0\.1):\d+$/.test(url));
  return okUrl && key && isPublicKey(key) ? { url, key } : null;
}

export function crmHeaders(key: string): Record<string, string> {
  return /^eyJ/.test(key) ? { apikey: key, Authorization: `Bearer ${key}` } : { apikey: key };
}

// The pages never wait long for the database (a paused or unreachable project): after this they render without listings.
const TIMEOUT_MS = 3500;

// One read per request (the page and its metadata share it), refreshed at most once a minute.
const loadRows = cache(async (): Promise<CrmSiteRow[]> => {
  const cfg = crmConfig();
  if (!cfg) return [];
  try {
    const res = await Promise.race([
      fetch(`${cfg.url}/rest/v1/rpc/crm_site_properties`, {
        headers: { ...crmHeaders(cfg.key), Accept: 'application/json' },
        next: { revalidate: 60 },
      }),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), TIMEOUT_MS)),
    ]);
    if (!res || !res.ok) return [];
    const data: unknown = await res.json();
    return Array.isArray(data)
      ? data.filter((r): r is CrmSiteRow => !!r && typeof r === 'object' && typeof (r as CrmSiteRow).id === 'string').slice(0, 500)
      : [];
  } catch {
    return [];
  }
});

const str = (v: unknown, max = 200): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null);
const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, 80)).slice(0, 40) : []);
const fmtN = (n: number) => new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 }).format(n);
const camereTxt = (n: number) => fmtN(n) + (n === 1 ? ' cameră' : ' camere');
const etajLabel = (v: number) => (v === -1 ? 'Demisol' : v === 0 ? 'Parter' : v === 100 ? 'Mansardă' : `Etaj ${v}`);

/** The same title the CRM makes when the agent leaves "Titlu anunț" empty. */
function autoTitle(p: { tip: string | null; camere: number | null; suprafata: number | null; tranzactie: string | null; zona: string | null; localitate: string | null }): string {
  let s = p.tip === 'Casă / Vilă' ? 'Casă' : p.tip || 'Proprietate';
  if (p.camere != null && !/Garsonier|Teren|Cameră/.test(p.tip || '')) s += ' ' + camereTxt(p.camere);
  if (/Teren|Spațiu|Birou/.test(p.tip || '') && p.suprafata != null) s += ' ' + fmtN(p.suprafata) + ' mp';
  s += p.tranzactie === 'inchiriere' ? ' de închiriat' : p.tranzactie === 'vanzare' ? ' de vânzare' : '';
  const loc = p.zona || p.localitate;
  return loc ? `${s}, ${loc}` : s;
}

function futureDate(v: unknown): string | null {
  const m = typeof v === 'string' ? /^(\d{4})-(\d{2})-(\d{2})/.exec(v) : null;
  if (!m) return null;
  const today = new Date().toISOString().slice(0, 10);
  return m[0] > today ? `${m[3]}.${m[2]}.${m[1]}` : null;
}

function toPublic(r: CrmSiteRow): PublicProperty {
  const tip = str(r.tip, 40), tranzactie = r.tranzactie === 'inchiriere' ? 'inchiriere' : r.tranzactie === 'vanzare' ? 'vanzare' : null;
  const pret = num(r.pret), suprafata = num(r.suprafata), camere = num(r.camere), etaj = num(r.etaj), etajeTotal = num(r.etajeTotal), an = num(r.an);
  const localitate = str(r.localitate, 80), zona = str(r.zona, 80), judet = str(r.judet, 40);
  const isLand = tip === 'Teren', isHouse = tip === 'Casă / Vilă' || isLand;
  const showRooms = camere != null && !/Garsonier|Teren|Cameră/.test(tip || '');
  const photos = list(r.poze).filter((id) => /^[A-Za-z0-9_-]{6,128}$/.test(id)).map((id) => `/poze/${id}`);
  const facts: PublicFact[] = [];
  const add = (label: string, value: string | null) => { if (value) facts.push({ label, value }); };
  add('Tip proprietate', tip);
  add('Tranzacție', tranzactie === 'inchiriere' ? 'Închiriere' : tranzactie === 'vanzare' ? 'Vânzare' : null);
  add(isLand ? 'Suprafață teren' : 'Suprafață utilă', suprafata != null ? `${fmtN(suprafata)} m²` : null);
  if (tranzactie === 'vanzare' && pret && suprafata) add('Preț pe m²', `${new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 }).format(pret / suprafata)} €/m²`);
  add('Camere', showRooms ? fmtN(camere as number) : null);
  if (isHouse) add('Niveluri', etajeTotal != null && !isLand ? fmtN(etajeTotal) : null);
  else { add('Etaj', etaj != null ? etajLabel(etaj) : null); add('Etaje în clădire', etajeTotal != null ? fmtN(etajeTotal) : null); }
  add('An construcție', an != null ? String(an) : null);
  add('Tip construcție', str(r.tipConstructie, 60));
  add('Material', str(r.material, 60));
  add('Stare', str(r.stare, 60));
  add('Încălzire', str(r.incalzire, 60));
  add('Geamuri', str(r.geamuri, 60));
  add('Disponibil de la', futureDate(r.disponibilDe));
  add('Localitate', localitate);
  add('Zonă', zona);
  add('Județ', judet);
  const features = Array.from(new Set([...list(r.particularitati), ...list(r.media), ...list(r.facilitati), ...list(r.siguranta)]));
  const attributes: Record<string, unknown> = { photos };
  if (showRooms) attributes.camere = camere;
  if (!isHouse && etaj != null) attributes.etaj = etajLabel(etaj);
  if (an != null) attributes.an_constructie = an;
  return {
    id: r.id,
    internal_code: str(r.cod, 20),
    title: str(r.titlu) || autoTitle({ tip, camere, suprafata, tranzactie, zona, localitate }),
    description: str(r.descriere, 8000),
    price: pret != null && pret > 0 ? pret : null,
    currency: 'EUR',
    category: tip ? CATEGORY[tip] || tip : null,
    transaction: tranzactie,
    city: localitate, county: judet, zone: zona,
    surface_useful: isLand ? null : suprafata, surface_built: null, surface_land: isLand ? suprafata : null,
    attributes, type_label: tip, facts, features,
    updated_at: num(r.m),
  };
}

export function slugify(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '');
}

function propertyKey(property: Pick<PublicProperty, 'id' | 'internal_code'>): string {
  return property.internal_code?.toLowerCase().replace(/[^a-z0-9-]/g, '') || property.id;
}

/** /proprietati/<titlu>-<cod>, e.g. /proprietati/apartament-3-camere-de-vanzare-galaxiei-p101 (the CRM builds the same link). */
export function publicPropertyPath(property: Pick<PublicProperty, 'id' | 'internal_code' | 'title'>): string {
  return `/proprietati/${slugify(property.title) || 'oferta'}-${propertyKey(property)}`;
}

function normalizeName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('ro').replace(/[^a-z0-9]/g, '');
}

/** The properties on the site, most recently changed first; optionally only one locality. */
export async function getPublicProperties(city?: string): Promise<PublicProperty[]> {
  const all = (await loadRows()).map(toPublic);
  return city ? all.filter((p) => normalizeName(p.city || '').includes(normalizeName(city))) : all;
}

/** One property by its link. The code at the end decides, so a link keeps working when the title changes. */
export async function getPublicProperty(param: string): Promise<PublicProperty | null> {
  const all = await getPublicProperties();
  const want = param.toLowerCase();
  return all.find((p) => publicPropertyPath(p) === `/proprietati/${param}`) ||
    all.find((p) => { const k = propertyKey(p).toLowerCase(); return want === k || want.endsWith(`-${k}`); }) ||
    null;
}
