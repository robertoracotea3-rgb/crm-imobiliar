import { isPropertyStatus } from './crm-catalogs.ts';
import {
  PROPERTY_CATEGORY_CODES,
  isPropertyCategory,
  validatePropertyTypeFields,
} from './property-types.ts';

export const PROPERTY_CATEGORIES = PROPERTY_CATEGORY_CODES;
export const PROPERTY_TRANSACTIONS = ['vanzare', 'inchiriere', 'regim_hotelier'] as const;
export const PROPERTY_CURRENCIES = ['EUR', 'RON', 'USD'] as const;
export const PROPERTY_PUBLICATION_CHANNELS = [
  'site',
  'imobiliare',
  'olx',
  'storia',
  'facebook',
] as const;

const STATUS_ALIASES: Record<string, string> = {
  active: 'activa',
  reserved: 'rezervata',
  sold: 'tranzactionata',
  rented: 'inchiriata',
};

const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
const text = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const cleaned = value.trim().slice(0, max);
  return cleaned || null;
};
const number = (value: unknown): number | null => {
  if (value === '' || value === null || value === undefined) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};
const has = (value: Record<string, unknown>, key: string) =>
  Object.prototype.hasOwnProperty.call(value, key);

export interface NormalizedPropertyWrite {
  columns: Record<string, unknown>;
  attributes?: Record<string, unknown>;
  agentId?: string | null;
  ownerContactId?: string | null;
  errors: string[];
}

export function normalizePropertyWrite(
  input: unknown,
  options: { mode: 'create' | 'update' },
): NormalizedPropertyWrite {
  const raw = record(input);
  const attributes = has(raw, 'attributes') ? { ...record(raw.attributes) } : undefined;
  const errors: string[] = [];
  const columns: Record<string, unknown> = {};

  const title = text(raw.title, 240);
  if (!title) errors.push('Titlul este obligatoriu.');
  else columns.title = title;

  if (has(raw, 'price')) {
    const price = number(raw.price);
    if (price !== null && price < 0) errors.push('Prețul nu poate fi negativ.');
    else columns.price = price;
  }

  const currency = String(raw.currency ?? attributes?.currency ?? 'EUR').toUpperCase();
  if (!(PROPERTY_CURRENCIES as readonly string[]).includes(currency)) {
    errors.push('Moneda proprietății este invalidă.');
  } else if (options.mode === 'create' || has(raw, 'currency')) {
    columns.currency = currency;
  }

  const category = raw.category;
  if (options.mode === 'create' || category !== undefined) {
    if (!isPropertyCategory(category)) {
      errors.push('Categoria proprietății este invalidă.');
    } else columns.category = category;
  }

  let transaction = raw.transaction;
  if (options.mode === 'create' && !transaction) {
    const offer = String(attributes?.tip_oferta || '').toLocaleLowerCase('ro-RO');
    transaction = offer.includes('chirie') || offer.includes('închiriere') ? 'inchiriere' : 'vanzare';
  }
  if (options.mode === 'create' || transaction !== undefined) {
    if (!(PROPERTY_TRANSACTIONS as readonly unknown[]).includes(transaction)) {
      errors.push('Tipul tranzacției este invalid.');
    } else columns.transaction = transaction;
  }

  if (options.mode === 'create') {
    const rawStatus = String(raw.status || 'draft');
    const status = STATUS_ALIASES[rawStatus] || rawStatus;
    columns.status = isPropertyStatus(status) ? status : 'draft';
  }

  const mappedText: Array<[string, unknown, number]> = [
    ['description', raw.description, 30_000],
    ['description_en', raw.description_en ?? attributes?.descriere_en, 30_000],
    ['county', raw.county ?? attributes?.judet, 120],
    ['city', raw.city ?? attributes?.localitate, 160],
    ['zone', raw.zone ?? attributes?.zona ?? attributes?.cartier, 160],
    ['street', raw.street ?? attributes?.strada, 200],
    ['street_number', raw.street_number ?? attributes?.numar, 30],
    ['private_notes', raw.private_notes ?? attributes?.obs_interne, 10_000],
  ];
  for (const [key, value, max] of mappedText) {
    if (options.mode === 'create' || has(raw, key) || attributes !== undefined) columns[key] = text(value, max);
  }

  const mappedNumbers: Array<[string, unknown, number, number]> = [
    ['latitude', raw.latitude ?? attributes?.lat, -90, 90],
    ['longitude', raw.longitude ?? attributes?.lon, -180, 180],
    ['surface_useful', raw.surface_useful ?? attributes?.sup_utila, 0, 1_000_000],
    ['surface_built', raw.surface_built ?? attributes?.sup_construita, 0, 1_000_000],
    ['surface_land', raw.surface_land ?? attributes?.sup_teren, 0, 100_000_000],
  ];
  for (const [key, value, minimum, maximum] of mappedNumbers) {
    if (options.mode !== 'create' && !has(raw, key) && attributes === undefined) continue;
    const parsed = number(value);
    if (parsed !== null && (parsed < minimum || parsed > maximum)) errors.push(`${key} are o valoare invalidă.`);
    else columns[key] = parsed;
  }

  if (attributes !== undefined) {
    const publication = record(attributes.publicare);
    attributes.publicare = Object.fromEntries(
      PROPERTY_PUBLICATION_CHANNELS.map((channel) => [channel, publication[channel] === true]),
    );
    const serializedSize = JSON.stringify(attributes).length;
    if (serializedSize > 250_000) errors.push('Datele extinse ale proprietății sunt prea mari.');
  }

  if (
    isPropertyCategory(category)
    && (options.mode === 'create' || attributes !== undefined)
  ) {
    errors.push(...validatePropertyTypeFields(category, {
      ...columns,
      attributes,
    }));
  }

  return {
    columns,
    ...(attributes !== undefined ? { attributes } : {}),
    ...(has(raw, 'agent_id') ? { agentId: text(raw.agent_id, 80) } : {}),
    ...(has(raw, 'owner_contact_id') ? { ownerContactId: text(raw.owner_contact_id, 80) } : {}),
    errors,
  };
}
