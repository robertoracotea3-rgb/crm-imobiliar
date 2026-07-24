import type { RawProspect } from './types';

function normalizedPhone(raw?: string | null): string | null {
  if (!raw) return null;
  let digits = raw.replace(/[^\d+]/g, '');
  digits = digits.replace(/^\+?40/, '0');
  return digits.match(/0\d{9}/)?.[0] ?? null;
}

export const PROSPECT_STATUSES = [
  'new', 'active', 'contacted', 'interested', 'rejected', 'stale', 'removed',
  'duplicate', 'agency_suspected', 'imported_to_portfolio',
] as const;
export type ProspectStatus = (typeof PROSPECT_STATUSES)[number];

const LEGACY_STATUS: Record<string, ProspectStatus> = {
  nou: 'new', activ: 'active', contactat: 'contacted', interesat: 'interested',
  refuzat: 'rejected', vechi: 'stale', sters: 'removed', duplicat: 'duplicate',
  agentie: 'agency_suspected', mandat: 'imported_to_portfolio',
};

const MOJIBAKE: Array<[RegExp, string]> = [
  [/Bra(?:Ãˆâ„¢|È™)ov/g, 'Brașov'], [/F(?:Ã„Æ’|Äƒ)g(?:Ã„Æ’|Äƒ)ra(?:Ãˆâ„¢|È™)/g, 'Făgăraș'],
  [/Ã„Æ’|Ã„â€š/g, 'ă'], [/ÃƒÂ¢|Ãƒâ€š/g, 'â'], [/ÃƒÂ®|ÃƒÅ½/g, 'î'],
  [/Ãˆâ„¢|ÃˆËœ/g, 'ș'], [/Ãˆâ€º|ÃˆÅ¡/g, 'ț'], [/Â·/g, '·'], [/Â²/g, '²'],
];

export function repairProspectText(value?: string | null): string {
  let output = String(value ?? '').trim();
  for (const [pattern, replacement] of MOJIBAKE) output = output.replace(pattern, replacement);
  return output.replace(/\s+/g, ' ').trim();
}

export function prospectMatchKey(value?: string | null): string {
  return repairProspectText(value)
    .toLocaleLowerCase('ro-RO')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

export function canonicalizeProspectUrl(raw?: string | null): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    url.hash = '';
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, '');
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$|ref$|source$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeProspectStatus(value: unknown): ProspectStatus {
  const key = prospectMatchKey(String(value ?? '')).replace(/ /g, '_');
  if ((PROSPECT_STATUSES as readonly string[]).includes(key)) return key as ProspectStatus;
  return LEGACY_STATUS[key] ?? 'active';
}

function normalizedCategory(raw?: string | null): string | null {
  const key = prospectMatchKey(raw);
  if (/garson/.test(key)) return 'studio_apartment';
  if (/apart/.test(key)) return 'apartament';
  if (/casa|vila|duplex/.test(key)) return 'casa';
  if (/teren|lot|parcela/.test(key)) return 'teren';
  if (/comercial|birou|hala|depozit/.test(key)) return 'comercial';
  return key || null;
}

function normalizedTransaction(raw?: string | null): string | null {
  const key = prospectMatchKey(raw);
  if (/inchiri|chirie|rent/.test(key)) return 'inchiriere';
  if (/vanz|sale/.test(key)) return 'vanzare';
  return key || null;
}

export interface NormalizedProspect {
  source: string;
  external_id: string;
  url: string;
  canonical_url: string;
  title: string | null;
  title_normalized: string | null;
  price: number | null;
  price_normalized: number | null;
  currency: string;
  category: string | null;
  transaction: string | null;
  county: string | null;
  county_normalized: string | null;
  city: string | null;
  city_normalized: string | null;
  zone: string | null;
  phone: string | null;
  phone_normalized: string | null;
  seller_name: string | null;
  posted_at: string | null;
  surface_area: number | null;
  similarity_key: string | null;
  search_text: string;
}

export function normalizeProspect(raw: RawProspect): NormalizedProspect | null {
  const source = prospectMatchKey(raw.source).replace(/ /g, '_');
  const externalId = repairProspectText(raw.external_id);
  const url = repairProspectText(raw.url);
  const canonicalUrl = canonicalizeProspectUrl(url);
  if (!source || !externalId || !canonicalUrl) return null;

  const title = repairProspectText(raw.title) || null;
  const titleKey = prospectMatchKey(title) || null;
  const city = repairProspectText(raw.city) || null;
  const county = repairProspectText(raw.county || 'Brașov') || null;
  const zone = repairProspectText(raw.zone) || null;
  const seller = repairProspectText(raw.seller_name) || null;
  const phone = normalizedPhone(raw.phone);
  const price = Number.isFinite(raw.price) && Number(raw.price) >= 0 ? Number(raw.price) : null;
  const surface = Number.isFinite(raw.surface_area) && Number(raw.surface_area) > 0 ? Number(raw.surface_area) : null;
  const currencyKey = prospectMatchKey(raw.currency || 'EUR').toUpperCase();
  const currency = currencyKey === 'LEI' ? 'RON' : (currencyKey === 'RON' ? 'RON' : 'EUR');
  const category = normalizedCategory(raw.category);
  const transaction = normalizedTransaction(raw.transaction);
  const cityKey = prospectMatchKey(city) || null;
  const similarityParts = titleKey && price !== null && cityKey
    ? [titleKey, String(Math.round(price)), cityKey, category || '', surface ? String(Math.round(surface)) : ''].join('|')
    : null;

  return {
    source, external_id: externalId, url, canonical_url: canonicalUrl,
    title, title_normalized: titleKey, price, price_normalized: price, currency,
    category, transaction, county, county_normalized: prospectMatchKey(county) || null,
    city, city_normalized: cityKey, zone, phone, phone_normalized: phone,
    seller_name: seller, posted_at: raw.posted_at || null, surface_area: surface,
    similarity_key: similarityParts,
    search_text: prospectMatchKey([title, seller, city, zone, phone, source].filter(Boolean).join(' ')),
  };
}

const AGENCY_PATTERNS: Array<[RegExp, string, number]> = [
  [/\b(agentie|agenția|agentia|imobiliare|realtor|broker)\b/i, 'termen specific unei agenții', 45],
  [/\b(comision|portofoliu|intermediere|consultant imobiliar)\b/i, 'limbaj comercial imobiliar', 30],
  [/\b(s\.?r\.?l\.?|companie|office|birou de vanzari)\b/i, 'identitate comercială', 30],
  [/\b(va oferim|oferta noastra|cod oferta|id oferta)\b/i, 'formulare comercială repetabilă', 20],
];

export function assessAgencySuspicion(
  prospect: Pick<NormalizedProspect, 'title' | 'seller_name'>,
  context: { reusedPhoneCount?: number; similarListingCount?: number } = {},
): { suspected: boolean; confidence: number; reasons: string[] } {
  const text = `${prospect.title ?? ''} ${prospect.seller_name ?? ''}`;
  const reasons: string[] = [];
  let score = 0;
  for (const [pattern, reason, points] of AGENCY_PATTERNS) {
    if (pattern.test(text)) { score += points; reasons.push(reason); }
  }
  if ((context.reusedPhoneCount ?? 0) >= 4) { score += 35; reasons.push('același număr apare în multe anunțuri'); }
  if ((context.similarListingCount ?? 0) >= 6) { score += 20; reasons.push('multe anunțuri cu structură similară'); }
  const confidence = Math.min(score, 95);
  return { suspected: confidence >= 45, confidence, reasons: [...new Set(reasons)] };
}

const MANUAL_STATUSES = new Set<ProspectStatus>(['contacted', 'interested', 'rejected', 'imported_to_portfolio']);

export function deriveProspectStatus(input: {
  previousStatus?: string | null;
  firstSeenAt: string | Date;
  lastSeenAt: string | Date;
  now?: string | Date;
  processedAt?: string | Date | null;
  missingCount?: number;
  duplicateConfirmed?: boolean;
  agencySuspected?: boolean;
}): ProspectStatus {
  const previous = normalizeProspectStatus(input.previousStatus);
  if (MANUAL_STATUSES.has(previous)) return previous;
  if ((input.missingCount ?? 0) >= 2) return 'removed';
  if (input.duplicateConfirmed) return 'duplicate';
  if (input.agencySuspected) return 'agency_suspected';
  const now = new Date(input.now ?? Date.now()).getTime();
  const first = new Date(input.firstSeenAt).getTime();
  const last = new Date(input.lastSeenAt).getTime();
  if (!input.processedAt && now - first <= 72 * 60 * 60 * 1000) return 'new';
  if (now - last > 7 * 24 * 60 * 60 * 1000) return 'stale';
  return 'active';
}
