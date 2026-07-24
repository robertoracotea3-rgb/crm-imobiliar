export const PROPERTY_TYPE_DEFINITIONS = [
  { code: 'apartament', label: 'Apartament', prefix: 'AP', family: 'apartment' },
  { code: 'studio_apartment', label: 'Garsonieră', prefix: 'GS', family: 'apartment' },
  { code: 'casa_vila', label: 'Casă/Vilă', prefix: 'CV', family: 'house' },
  { code: 'teren', label: 'Teren', prefix: 'TR', family: 'land' },
  { code: 'spatiu_comercial', label: 'Spațiu comercial', prefix: 'SC', family: 'commercial' },
  { code: 'birou', label: 'Birou', prefix: 'BR', family: 'commercial' },
  { code: 'spatiu_industrial', label: 'Hală/Industrial', prefix: 'HL', family: 'industrial' },
  { code: 'pensiune_hotel', label: 'Hotel/Pensiune', prefix: 'PH', family: 'hospitality' },
  { code: 'garaj', label: 'Garaj', prefix: 'GR', family: 'garage' },
] as const;

export type PropertyCategory = typeof PROPERTY_TYPE_DEFINITIONS[number]['code'];
export type PropertyFamily = typeof PROPERTY_TYPE_DEFINITIONS[number]['family'];

const LABEL_ALIASES: Record<string, PropertyCategory> = {
  Apartament: 'apartament',
  Garsonieră: 'studio_apartment',
  Garsoniera: 'studio_apartment',
  'Casă/Vilă': 'casa_vila',
  'Casa/Vila': 'casa_vila',
  Teren: 'teren',
  Fermă: 'teren',
  Ferma: 'teren',
  'Spațiu comercial': 'spatiu_comercial',
  'Spatiu comercial': 'spatiu_comercial',
  Birou: 'birou',
  Hală: 'spatiu_industrial',
  Hala: 'spatiu_industrial',
  Industrial: 'spatiu_industrial',
  'Hotel/Pensiune': 'pensiune_hotel',
  Garaj: 'garaj',
};

export const PROPERTY_CATEGORY_LABELS: Readonly<Record<PropertyCategory, string>> =
  Object.fromEntries(
    PROPERTY_TYPE_DEFINITIONS.map((definition) => [definition.code, definition.label]),
  ) as Record<PropertyCategory, string>;

export const PROPERTY_CATEGORY_CODES = PROPERTY_TYPE_DEFINITIONS.map(
  (definition) => definition.code,
) as readonly PropertyCategory[];

export function isPropertyCategory(value: unknown): value is PropertyCategory {
  return typeof value === 'string'
    && (PROPERTY_CATEGORY_CODES as readonly string[]).includes(value);
}

export function propertyCategoryFromLabel(value: unknown): PropertyCategory | null {
  if (isPropertyCategory(value)) return value;
  return typeof value === 'string' ? LABEL_ALIASES[value.trim()] || null : null;
}

export function propertyCategoryLabel(value: unknown): string {
  return isPropertyCategory(value) ? PROPERTY_CATEGORY_LABELS[value] : String(value || 'Proprietate');
}

export function propertyCodePrefix(value: unknown): string {
  const category = propertyCategoryFromLabel(value);
  return PROPERTY_TYPE_DEFINITIONS.find((definition) => definition.code === category)?.prefix || 'PR';
}

export function propertyFamily(value: unknown): PropertyFamily | 'other' {
  const category = propertyCategoryFromLabel(value);
  return PROPERTY_TYPE_DEFINITIONS.find((definition) => definition.code === category)?.family || 'other';
}

export type PropertyFieldKey =
  | 'surface_useful'
  | 'surface_built'
  | 'surface_total'
  | 'surface_land'
  | 'surface_yard'
  | 'surface_balcony'
  | 'surface_terrace'
  | 'surface_cellar'
  | 'surface_garage'
  | 'street_frontage'
  | 'rooms'
  | 'bedrooms'
  | 'bathrooms'
  | 'kitchens'
  | 'balconies'
  | 'terraces'
  | 'parking'
  | 'compartmentation'
  | 'comfort'
  | 'floor'
  | 'building_floors'
  | 'building'
  | 'energy'
  | 'finishes'
  | 'heating'
  | 'land_details'
  | 'commercial_details'
  | 'block_address';

export type PropertyFieldRule = 'required' | 'optional' | 'hidden' | 'calculated';

const FIELD_RULES_BY_FAMILY: Readonly<Record<PropertyFamily, Readonly<Partial<Record<PropertyFieldKey, PropertyFieldRule>>>>> = {
  apartment: {
    surface_useful: 'required',
    surface_built: 'optional',
    surface_total: 'optional',
    surface_balcony: 'optional',
    surface_terrace: 'optional',
    rooms: 'required',
    bedrooms: 'optional',
    bathrooms: 'optional',
    kitchens: 'optional',
    balconies: 'optional',
    terraces: 'optional',
    compartmentation: 'optional',
    comfort: 'optional',
    floor: 'optional',
    building_floors: 'optional',
    building: 'optional',
    energy: 'optional',
    finishes: 'optional',
    heating: 'optional',
    block_address: 'optional',
  },
  house: {
    surface_useful: 'required',
    surface_built: 'optional',
    surface_total: 'optional',
    surface_land: 'required',
    surface_yard: 'optional',
    surface_cellar: 'optional',
    surface_garage: 'optional',
    street_frontage: 'optional',
    rooms: 'required',
    bedrooms: 'optional',
    bathrooms: 'optional',
    kitchens: 'optional',
    terraces: 'optional',
    building: 'optional',
    energy: 'optional',
    finishes: 'optional',
    heating: 'optional',
  },
  land: {
    surface_land: 'required',
    street_frontage: 'optional',
    land_details: 'optional',
  },
  commercial: {
    surface_useful: 'required',
    surface_built: 'optional',
    surface_total: 'optional',
    street_frontage: 'optional',
    bathrooms: 'optional',
    parking: 'optional',
    floor: 'optional',
    building_floors: 'optional',
    building: 'optional',
    energy: 'optional',
    heating: 'optional',
    commercial_details: 'optional',
  },
  industrial: {
    surface_useful: 'required',
    surface_built: 'optional',
    surface_total: 'optional',
    surface_land: 'optional',
    street_frontage: 'optional',
    bathrooms: 'optional',
    parking: 'optional',
    building: 'optional',
    heating: 'optional',
    commercial_details: 'optional',
  },
  hospitality: {
    surface_useful: 'required',
    surface_built: 'optional',
    surface_total: 'optional',
    surface_land: 'optional',
    surface_yard: 'optional',
    surface_terrace: 'optional',
    rooms: 'required',
    bathrooms: 'optional',
    parking: 'optional',
    building_floors: 'optional',
    building: 'optional',
    energy: 'optional',
    finishes: 'optional',
    heating: 'optional',
    commercial_details: 'optional',
  },
  garage: {
    surface_useful: 'required',
    surface_garage: 'optional',
    building: 'optional',
  },
};

export function propertyFieldRule(
  category: unknown,
  field: PropertyFieldKey,
): PropertyFieldRule {
  const family = propertyFamily(category);
  if (family === 'other') return 'optional';
  return FIELD_RULES_BY_FAMILY[family][field] || 'hidden';
}

export function isPropertyFieldVisible(category: unknown, field: PropertyFieldKey): boolean {
  return propertyFieldRule(category, field) !== 'hidden';
}

export function isPropertyFieldRequired(category: unknown, field: PropertyFieldKey): boolean {
  return propertyFieldRule(category, field) === 'required';
}

const positive = (value: unknown): boolean => {
  if (value === '' || value === null || value === undefined) return false;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
};

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function validatePropertyTypeFields(
  category: unknown,
  values: Record<string, unknown>,
): string[] {
  if (!isPropertyCategory(category)) return ['Categoria proprietății este invalidă.'];
  const attributes = record(values.attributes);
  const requiredValues: Partial<Record<PropertyFieldKey, unknown>> = {
    surface_useful: values.surface_useful ?? attributes.sup_utila,
    surface_land: values.surface_land ?? attributes.sup_teren,
    rooms: attributes.nr_camere,
  };
  const labels: Partial<Record<PropertyFieldKey, string>> = {
    surface_useful: 'Suprafața utilă',
    surface_land: 'Suprafața terenului',
    rooms: 'Numărul de camere',
  };

  const errors: string[] = [];
  for (const field of ['surface_useful', 'surface_land', 'rooms'] as const) {
    if (isPropertyFieldRequired(category, field) && !positive(requiredValues[field])) {
      errors.push(`${labels[field]} este obligatorie pentru ${propertyCategoryLabel(category)}.`);
    }
  }
  return errors;
}

export const PORTAL_PROPERTY_TYPE_MAP: Readonly<Record<PropertyCategory, {
  storiaFamily: 'apartment' | 'house' | 'land' | 'store' | 'office' | 'warehouse' | 'garage';
  olxCategory: string;
  schemaType: string;
}>> = {
  apartament: { storiaFamily: 'apartment', olxCategory: 'apartments', schemaType: 'Apartment' },
  studio_apartment: { storiaFamily: 'apartment', olxCategory: 'apartments', schemaType: 'Apartment' },
  casa_vila: { storiaFamily: 'house', olxCategory: 'houses', schemaType: 'House' },
  teren: { storiaFamily: 'land', olxCategory: 'lots', schemaType: 'Landform' },
  spatiu_comercial: { storiaFamily: 'store', olxCategory: 'commercial-premises', schemaType: 'Place' },
  birou: { storiaFamily: 'office', olxCategory: 'offices', schemaType: 'Place' },
  spatiu_industrial: { storiaFamily: 'warehouse', olxCategory: 'warehouses', schemaType: 'Place' },
  pensiune_hotel: { storiaFamily: 'house', olxCategory: 'houses', schemaType: 'LodgingBusiness' },
  garaj: { storiaFamily: 'garage', olxCategory: 'garages', schemaType: 'ParkingFacility' },
};
