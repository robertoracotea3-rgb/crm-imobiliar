const PUBLIC_SITE_BASE_URL = 'https://www.kiraimobiliare.ro';

const PUBLIC_CATEGORY_LABELS: Record<string, string> = {
  apartament: 'Apartament',
  casa_vila: 'Casa Vila',
  teren: 'Teren',
  spatiu_comercial: 'Spatiu Comercial',
  spatiu_industrial: 'Spatiu Industrial',
  birou: 'Birou',
  pensiune_hotel: 'Pensiune Hotel',
  garaj: 'Garaj',
};

function publicSlugify(text: string): string {
  return String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\u0219\u015f]/g, 's')
    .replace(/[\u021b\u0163]/g, 't')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

export type PublicPropertyUrlInput = {
  id: string;
  internal_code?: string | null;
  category?: string | null;
  city?: string | null;
  attributes?: Record<string, unknown> | null;
};

export function buildPublicPropertyUrl(property: PublicPropertyUrlInput): string {
  const attrs = property.attributes || {};
  const attrText = (key: string) => (typeof attrs[key] === 'string' ? attrs[key] : '');
  const category =
    PUBLIC_CATEGORY_LABELS[property.category || ''] ||
    property.category?.replace(/_/g, ' ') ||
    attrText('tip_proprietate') ||
    'proprietate';
  const city = property.city || attrText('localitate') || attrText('oras') || 'fagaras';
  const code = property.internal_code || property.id.slice(0, 8);

  return `${PUBLIC_SITE_BASE_URL}/proprietati/${publicSlugify(category)}-${publicSlugify(city)}-${String(code).toLowerCase()}`;
}
