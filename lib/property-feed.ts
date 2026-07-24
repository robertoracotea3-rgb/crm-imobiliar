import { buildPublicPropertyUrl } from './public-property-url.mjs';

// Structura Storia urmează documentația oficială OLX Group Easy Content Exchange:
// https://developer.olxgroup.com/docs/xml-format-and-structure

export type FeedPortal = 'generic' | 'storia';

export type FeedProperty = {
  id: string;
  agency_id?: string | null;
  internal_code?: string | null;
  title?: string | null;
  description?: string | null;
  price?: number | string | null;
  currency?: string | null;
  category?: string | null;
  transaction?: string | null;
  status?: string | null;
  city?: string | null;
  county?: string | null;
  zone?: string | null;
  street?: string | null;
  street_number?: string | null;
  surface_useful?: number | string | null;
  surface_built?: number | string | null;
  surface_land?: number | string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  attributes?: Record<string, unknown> | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export type NormalizedFeedProperty = {
  source: FeedProperty;
  code: string;
  title: string;
  description: string;
  price: number;
  currency: string;
  category: string;
  transaction: string;
  city: string;
  county: string;
  zone: string;
  street: string;
  streetNumber: string;
  hideAddress: boolean;
  hideNumber: boolean;
  usefulArea: number | null;
  builtArea: number | null;
  landArea: number | null;
  rooms: number | null;
  bathrooms: number | null;
  floor: string;
  latitude: number | null;
  longitude: number | null;
  photos: string[];
  publicUrl: string;
  selected: boolean;
};

export type FeedDecision = {
  included: boolean;
  reasons: string[];
  property: NormalizedFeedProperty;
};

const CATEGORY_URNS: Record<string, Record<string, string>> = {
  apartament: { vanzare: 'urn:concept:apartments-for-sale', inchiriere: 'urn:concept:apartments-for-rent' },
  studio_apartment: { vanzare: 'urn:concept:apartments-for-sale', inchiriere: 'urn:concept:apartments-for-rent' },
  casa_vila: { vanzare: 'urn:concept:houses-for-sale', inchiriere: 'urn:concept:houses-for-rent' },
  casa: { vanzare: 'urn:concept:houses-for-sale', inchiriere: 'urn:concept:houses-for-rent' },
  vila: { vanzare: 'urn:concept:houses-for-sale', inchiriere: 'urn:concept:houses-for-rent' },
  teren: { vanzare: 'urn:concept:lots-for-sale', inchiriere: 'urn:concept:lots-for-rent' },
  spatiu_comercial: { vanzare: 'urn:concept:stores-for-sale', inchiriere: 'urn:concept:stores-for-rent' },
  comercial: { vanzare: 'urn:concept:stores-for-sale', inchiriere: 'urn:concept:stores-for-rent' },
  birou: { vanzare: 'urn:concept:offices-for-sale', inchiriere: 'urn:concept:offices-for-rent' },
  industrial: { vanzare: 'urn:concept:warehouses-for-sale', inchiriere: 'urn:concept:warehouses-for-rent' },
  hala: { vanzare: 'urn:concept:warehouses-for-sale', inchiriere: 'urn:concept:warehouses-for-rent' },
  garaj: { vanzare: 'urn:concept:garages-for-sale', inchiriere: 'urn:concept:garages-for-rent' },
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function text(...values: unknown[]): string {
  const found = values.find(value => typeof value === 'string' && value.trim());
  return typeof found === 'string' ? found.trim() : '';
}

function numberValue(...values: unknown[]): number | null {
  for (const value of values) {
    if (value === '' || value == null) continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function booleanValue(...values: unknown[]): boolean {
  return values.some(value => value === true || value === 'true' || value === 1);
}

function safePhotoUrls(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(item => typeof item === 'string' && /^https?:\/\//i.test(item))
    .map(item => String(item).replace('/medium.webp', '/large.webp'));
}

function normalizeCategory(value: string): string {
  return value.toLowerCase().trim().replace(/[\s-]+/g, '_');
}

function normalizeTransaction(value: string): string {
  const normalized = value.toLowerCase();
  return normalized.includes('inchir') ? 'inchiriere' : 'vanzare';
}

function normalizeCurrency(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized === '€' || normalized === 'EURO') return 'EUR';
  if (normalized === 'LEI' || normalized === 'RON') return 'RON';
  if (normalized === '$' || normalized === 'USD') return 'USD';
  return normalized || 'EUR';
}

function categoryFamily(category: string): 'apartment' | 'house' | 'land' | 'other' {
  if (category === 'studio_apartment' || category.includes('apartament') || category.includes('garson')) return 'apartment';
  if (category.includes('casa') || category.includes('vila')) return 'house';
  if (category.includes('teren') || category.includes('lot')) return 'land';
  return 'other';
}

function publicationKey(portal: FeedPortal): string {
  return portal === 'generic' ? 'site' : portal;
}

export function normalizeFeedProperty(property: FeedProperty, portal: FeedPortal): NormalizedFeedProperty {
  const attributes = record(property.attributes);
  const publication = record(attributes.publicare);
  const category = normalizeCategory(text(property.category, attributes.tip_proprietate, 'proprietate'));
  const transaction = normalizeTransaction(text(property.transaction, attributes.tranzactie, 'vanzare'));
  const hideAddress = booleanValue(attributes.ascunde_adresa, attributes.hide_address);
  const hideNumber = hideAddress || booleanValue(attributes.ascunde_numar, attributes.ascunde_numarul, attributes.hide_street_number);
  const latitude = numberValue(property.latitude, attributes.lat, attributes.latitude);
  const longitude = numberValue(property.longitude, attributes.lon, attributes.lng, attributes.longitude);

  return {
    source: property,
    code: text(property.internal_code),
    title: text(property.title),
    description: text(property.description, attributes.descriere),
    price: numberValue(property.price, attributes.pret) ?? 0,
    currency: normalizeCurrency(text(property.currency, attributes.moneda, 'EUR')),
    category,
    transaction,
    city: text(property.city, attributes.localitate, attributes.oras),
    county: text(property.county, attributes.judet),
    zone: text(property.zone, attributes.zona),
    street: text(property.street, attributes.strada),
    streetNumber: text(property.street_number, attributes.numar),
    hideAddress,
    hideNumber,
    usefulArea: numberValue(property.surface_useful, attributes.sup_utila),
    builtArea: numberValue(property.surface_built, attributes.sup_construita),
    landArea: numberValue(property.surface_land, attributes.sup_teren),
    rooms: numberValue(attributes.nr_camere, attributes.camere),
    bathrooms: numberValue(attributes.nr_bai, attributes.bai),
    floor: text(attributes.etaj),
    latitude: latitude && latitude !== 0 ? latitude : null,
    longitude: longitude && longitude !== 0 ? longitude : null,
    photos: safePhotoUrls(attributes.photos),
    publicUrl: buildPublicPropertyUrl(property),
    selected: booleanValue(publication[publicationKey(portal)]),
  };
}

export function evaluatePropertyForFeed(property: FeedProperty, portal: FeedPortal): FeedDecision {
  const normalized = normalizeFeedProperty(property, portal);
  const reasons: string[] = [];
  const status = text(property.status).toLowerCase();

  if (status !== 'activa') reasons.push(`status_${status || 'missing'}`);
  if (!normalized.selected) reasons.push(`not_selected_for_${publicationKey(portal)}`);
  if (!normalized.code) reasons.push('missing_internal_code');
  if (normalized.title.length < 5) reasons.push('missing_or_short_title');
  if (!normalized.description) reasons.push('missing_description');
  if (!normalized.city) reasons.push('missing_city');
  if (normalized.price <= 0) reasons.push('invalid_price');
  if (normalized.photos.length === 0) reasons.push('missing_photos');

  if (portal === 'storia') {
    if (normalized.description.length < 50) reasons.push('description_too_short_for_storia');
    if (normalized.latitude == null || normalized.longitude == null) {
      reasons.push('missing_coordinates');
    } else if (
      normalized.latitude < -90 || normalized.latitude > 90
      || normalized.longitude < -180 || normalized.longitude > 180
    ) {
      reasons.push('invalid_coordinates');
    }
    if (!CATEGORY_URNS[normalized.category]?.[normalized.transaction]) reasons.push('unsupported_category');
    if (!['EUR', 'RON'].includes(normalized.currency)) reasons.push('unsupported_currency');
    const family = categoryFamily(normalized.category);
    if ((family === 'apartment' || family === 'house') && (!normalized.rooms || normalized.rooms < 1)) {
      reasons.push('missing_rooms');
    }
    if (family !== 'land' && (!normalized.usefulArea || normalized.usefulArea <= 0)) reasons.push('missing_useful_area');
    if ((family === 'house' || family === 'land') && (!normalized.landArea || normalized.landArea <= 0)) {
      reasons.push('missing_land_area');
    }
  }

  return { included: reasons.length === 0, reasons, property: normalized };
}

function cleanXml(value: unknown): string {
  return String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g, '');
}

export function escapeXml(value: unknown): string {
  return cleanXml(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function tag(name: string, value: unknown): string {
  const content = cleanXml(value);
  return content ? `<${name}>${escapeXml(content)}</${name}>` : '';
}

function categoryUrn(property: NormalizedFeedProperty): string {
  return CATEGORY_URNS[property.category]?.[property.transaction]
    || (property.transaction === 'inchiriere' ? 'urn:concept:apartments-for-rent' : 'urn:concept:apartments-for-sale');
}

function storiaAttributes(property: NormalizedFeedProperty): Array<{ urn: string; value: string }> {
  const attributes: Array<{ urn: string; value: string }> = [];
  const family = categoryFamily(property.category);
  if ((family === 'apartment' || family === 'house') && property.rooms) {
    attributes.push({ urn: 'urn:concept:number-of-rooms', value: property.rooms > 10 ? 'urn:concept:more' : `urn:concept:${Math.round(property.rooms)}` });
  }
  if (family === 'land' && property.landArea) {
    attributes.push({ urn: 'urn:concept:net-area-m2', value: String(property.landArea) });
  } else if (property.usefulArea) {
    attributes.push({ urn: 'urn:concept:net-area-m2', value: String(property.usefulArea) });
  }
  if (family === 'house' && property.landArea) {
    attributes.push({ urn: 'urn:concept:terrain-area-m2', value: String(property.landArea) });
  }
  if (property.transaction === 'vanzare' && family !== 'land') {
    attributes.push({ urn: 'urn:concept:market', value: 'urn:concept:secondary' });
  }
  return attributes;
}

function buildGenericPropertyXml(property: NormalizedFeedProperty): string {
  const locationParts = [
    tag('city', property.city),
    tag('county', property.county),
    tag('zone', property.zone),
    !property.hideAddress ? tag('street', property.street) : '',
    !property.hideNumber ? tag('street_number', property.streetNumber) : '',
    property.latitude != null ? tag('latitude', property.latitude) : '',
    property.longitude != null ? tag('longitude', property.longitude) : '',
    tag('exact', property.hideAddress || property.hideNumber ? 'false' : 'true'),
  ].filter(Boolean).join('');
  const photos = property.photos.slice(0, 60).map((url, index) =>
    `<image><url>${escapeXml(url)}</url><order>${index + 1}</order></image>`
  ).join('');

  return `<property><id>${escapeXml(property.code)}</id><code>${escapeXml(property.code)}</code>${tag('title', property.title)}${tag('description', property.description)}<price><value>${property.price}</value><currency>${escapeXml(property.currency)}</currency></price>${tag('category', property.category)}${tag('transaction', property.transaction)}<location>${locationParts}</location><surfaces>${tag('useful', property.usefulArea)}${tag('built', property.builtArea)}${tag('land', property.landArea)}</surfaces>${tag('rooms', property.rooms)}${tag('bathrooms', property.bathrooms)}${tag('floor', property.floor)}<url>${escapeXml(property.publicUrl)}</url>${tag('created_at', property.source.created_at)}${tag('updated_at', property.source.updated_at || property.source.created_at)}<images>${photos}</images></property>`;
}

function buildStoriaAdvertXml(property: NormalizedFeedProperty): string {
  const photos = property.photos.slice(0, 60).map((url, index) =>
    `<image><url>${escapeXml(url)}</url><order>${index + 1}</order></image>`
  ).join('');
  const attributes = storiaAttributes(property).map(attribute =>
    `<attribute><urn>${escapeXml(attribute.urn)}</urn><value>${escapeXml(attribute.value)}</value></attribute>`
  ).join('');

  return `<advert><custom_fields><id>${escapeXml(property.code)}</id><reference_id>${escapeXml(property.code)}</reference_id></custom_fields><title>${escapeXml(property.title.slice(0, 70))}</title><description>${escapeXml(property.description.slice(0, 4096))}</description><category_urn>${escapeXml(categoryUrn(property))}</category_urn><price><value>${property.price}</value><currency>${escapeXml(property.currency)}</currency></price><images>${photos}</images><location><lat>${property.latitude}</lat><lon>${property.longitude}</lon><exact>${property.hideAddress || property.hideNumber ? 'false' : 'true'}</exact></location><attributes>${attributes}</attributes></advert>`;
}

export function buildPropertyFeed(
  portal: FeedPortal,
  properties: NormalizedFeedProperty[],
  generatedAt: string,
  ownerEmail = '',
): string {
  if (portal === 'storia') {
    const adverts = properties.map(buildStoriaAdvertXml).join('');
    return `<?xml version="1.0" encoding="UTF-8"?><data><header><owner_email>${escapeXml(ownerEmail)}</owner_email><site_urn>urn:site:storiaro</site_urn></header><adverts>${adverts}</adverts></data>`;
  }

  const items = properties.map(buildGenericPropertyXml).join('');
  return `<?xml version="1.0" encoding="UTF-8"?><properties portal="generic" count="${properties.length}" generated="${escapeXml(generatedAt)}">${items}</properties>`;
}

function validateWellFormedXml(xml: string): string[] {
  const errors: string[] = [];
  const withoutSpecial = xml
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '');
  const stack: string[] = [];
  const tokenPattern = /<\/?([A-Za-z_][\w:.-]*)(?:\s[^<>]*)?\s*\/?>/g;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(withoutSpecial))) {
    const token = match[0];
    const name = match[1];
    if (token.startsWith('</')) {
      if (stack.pop() !== name) errors.push(`xml_unbalanced_${name}`);
    } else if (!token.endsWith('/>')) {
      stack.push(name);
    }
  }
  if (stack.length) errors.push(`xml_unclosed_${stack.at(-1)}`);
  if (/<(?!\/?[A-Za-z_!?])/.test(withoutSpecial)) errors.push('xml_invalid_tag');
  if (/&(?!amp;|lt;|gt;|quot;|apos;)/.test(withoutSpecial)) errors.push('xml_invalid_entity');
  return errors;
}

export function validatePropertyFeedXml(xml: string, portal: FeedPortal): string[] {
  const errors = validateWellFormedXml(xml);
  if (!xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')) errors.push('xml_declaration_missing');
  if (/crm\.kiraimobiliare\.ro/i.test(xml)) errors.push('internal_crm_url_exposed');
  if (/<id>[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}<\/id>/i.test(xml)) {
    errors.push('internal_uuid_exposed');
  }
  if (portal === 'storia') {
    if (!xml.includes('<data>') || !xml.includes('<header>') || !xml.includes('<adverts>')) errors.push('storia_structure_missing');
    if (!xml.includes('<site_urn>urn:site:storiaro</site_urn>')) errors.push('storia_site_urn_missing');
    if (!/<owner_email>[^<\s]+@[^<\s]+<\/owner_email>/.test(xml)) errors.push('storia_owner_email_missing');
  } else if (!/<properties portal="generic" count="\d+" generated="[^"]+">/.test(xml)) {
    errors.push('generic_root_invalid');
  }
  return [...new Set(errors)];
}
