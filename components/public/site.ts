/*
 * Shared, client-safe pieces of the public site: contact details, the slim property shape the
 * interactive components receive, and the formatting helpers. No server-only imports here.
 */

export const SITE = {
  phone: '0775 132 969',
  phoneLink: 'tel:+40775132969',
  whatsapp: '40775132969',
  email: 'kiraimobiliare@gmail.com',
  address: 'Jud. Brașov, loc. Brașov',
  hours: 'Luni–Vineri 09:00–18:00',
};

/** A WhatsApp chat with the agency, optionally with the message already written. */
export const waLink = (text?: string) => `https://wa.me/${SITE.whatsapp}${text ? `?text=${encodeURIComponent(text)}` : ''}`;

/** What a property card, the map, the favourites and the search need. Built on the server from PublicProperty. */
export type CardProperty = {
  id: string;
  path: string;
  title: string;
  code: string | null;
  price: number | null;
  transaction: 'vanzare' | 'inchiriere' | null;
  typeLabel: string | null;
  city: string | null;
  zone: string | null;
  county: string | null;
  surface: number | null;
  land: boolean;
  rooms: number | null;
  floor: string | null;
  year: number | null;
  photos: string[];
  photoCount: number;
  updatedAt: number | null;
  /** The pin set in the CRM. With aprox, only a point near the property, and the site draws a circle on the zone. Missing in favourites saved before. */
  geo?: GeoPoint | null;
};

export type GeoPoint = { lat: number; lng: number; aprox: boolean };

export const TYPE_OPTIONS = ['Apartament', 'Garsonieră', 'Casă / Vilă', 'Teren', 'Spațiu comercial', 'Birou', 'Spațiu industrial', 'Cameră'];

const fmt0 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 0 });
const fmt1 = new Intl.NumberFormat('ro-RO', { maximumFractionDigits: 1 });
export const money = (n: number) => fmt0.format(n);
export const num = (n: number) => fmt1.format(n);

export function priceLabel(p: Pick<CardProperty, 'price' | 'transaction'>): string {
  if (!p.price) return 'Preț la cerere';
  return `${money(p.price)} €${p.transaction === 'inchiriere' ? ' / lună' : ''}`;
}

export const transactionLabel = (t: CardProperty['transaction']) => (t === 'inchiriere' ? 'Închiriere' : t === 'vanzare' ? 'Vânzare' : null);

export function placeLabel(p: Pick<CardProperty, 'city' | 'zone' | 'county'>): string {
  return [p.city, p.zone].filter(Boolean).join(', ') || p.county || 'Zona se confirmă la telefon';
}

export const roomsLabel = (n: number) => `${num(n)} ${n === 1 ? 'cameră' : 'camere'}`;

// Diacritics-insensitive matching ("Sercaia" finds "Șercaia"). Built from char codes so no editor rewrites the range.
const MARKS = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');
export const norm = (s: string) => s.normalize('NFD').replace(MARKS, '').toLowerCase().trim();
