import { normalizeMatchKey, type DemandMatchInput } from '@/lib/match-score';

export const DEMAND_INTENTS = ['cumparare', 'inchiriere', 'vanzare', 'oferire_inchiriere'] as const;
export type DemandIntent = typeof DEMAND_INTENTS[number];

export const DEMAND_PROPERTY_TYPES = [
  'apartament',
  'casa_vila',
  'spatiu_comercial',
  'spatiu_industrial',
  'teren',
  'pensiune_hotel',
  'birou',
  'garaj',
] as const;

export interface DemandRecordInput extends DemandMatchInput {
  id?: string;
  contact_id?: string | null;
  agent_id?: string | null;
  source?: string | null;
  notes?: string | null;
  financing?: string | null;
  deadline_date?: string | null;
  status?: string | null;
}

export interface NormalizedDemandRecord {
  contact_id: string | null;
  agent_id: string | null;
  intent: DemandIntent;
  transaction: 'vanzare' | 'inchiriere';
  category: typeof DEMAND_PROPERTY_TYPES[number];
  property_types: string[];
  budget_min: number | null;
  budget_max: number | null;
  budget_unknown: boolean;
  currency: 'EUR' | 'RON';
  counties: string[];
  cities: string[];
  zones: string[];
  radius_km: number | null;
  rooms_min: number | null;
  rooms_max: number | null;
  usable_area_min: number | null;
  usable_area_max: number | null;
  land_area_min: number | null;
  land_area_max: number | null;
  floor_preferences: string[];
  furnished_preference: string | null;
  parking_required: boolean;
  financing: string | null;
  deadline_date: string | null;
  special_requirements: string | null;
  source: string | null;
  notes: string | null;
  criteria: Record<string, unknown>;
}

function nullableText(value: unknown): string | null {
  const result = String(value ?? '').trim();
  return result || null;
}

function nullableId(value: unknown): string | null {
  const result = nullableText(value);
  if (!result) return null;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(result)) {
    throw new Error('Identificator CRM invalid');
  }
  return result;
}

function nullableNumber(value: unknown, label: string): number | null {
  if (value === null || value === undefined || value === '') return null;
  const result = Number(value);
  if (!Number.isFinite(result) || result < 0) throw new Error(`${label} este invalid`);
  return result;
}

function normalizedList(value: unknown, limit: number, label: string): string[] {
  if (value === null || value === undefined || value === '') return [];
  if (!Array.isArray(value)) throw new Error(`${label} trebuie să fie o listă`);
  const unique = new Map<string, string>();
  for (const raw of value) {
    const original = nullableText(raw);
    const key = normalizeMatchKey(original);
    if (original && key && !unique.has(key)) unique.set(key, original);
  }
  if (unique.size > limit) throw new Error(`${label} conține prea multe valori`);
  return [...unique.values()];
}

function validateRange(min: number | null, max: number | null, label: string): void {
  if (min !== null && max !== null && min > max) {
    throw new Error(`${label}: valoarea minimă nu poate depăși valoarea maximă`);
  }
}

function dateOnly(value: unknown): string | null {
  const result = nullableText(value);
  if (!result) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(result) || Number.isNaN(new Date(`${result}T00:00:00Z`).getTime())) {
    throw new Error('Termenul cererii este invalid');
  }
  return result;
}

export function intentTransaction(intent: DemandIntent): 'vanzare' | 'inchiriere' {
  return intent === 'inchiriere' || intent === 'oferire_inchiriere' ? 'inchiriere' : 'vanzare';
}

export function isPropertySearchIntent(intent: string | null | undefined): boolean {
  return intent === 'cumparare' || intent === 'inchiriere' || !intent;
}

export function normalizeDemandRecord(input: DemandRecordInput): NormalizedDemandRecord {
  const intentValue = nullableText(input.intent) || (input.transaction === 'inchiriere' ? 'inchiriere' : 'cumparare');
  if (!DEMAND_INTENTS.includes(intentValue as DemandIntent)) throw new Error('Tipul cererii este invalid');
  const intent = intentValue as DemandIntent;

  const propertyTypes = normalizedList(
    input.property_types?.length ? input.property_types : [input.category || 'apartament'],
    DEMAND_PROPERTY_TYPES.length,
    'Tipurile de proprietate',
  );
  if (propertyTypes.length === 0 || propertyTypes.some((value) => !DEMAND_PROPERTY_TYPES.includes(value as typeof DEMAND_PROPERTY_TYPES[number]))) {
    throw new Error('Selectează cel puțin un tip valid de proprietate');
  }

  const budgetUnknown = input.budget_unknown === true;
  const budgetMin = budgetUnknown ? null : nullableNumber(input.budget_min, 'Bugetul minim');
  const budgetMax = budgetUnknown ? null : nullableNumber(input.budget_max, 'Bugetul maxim');
  if (!budgetUnknown && budgetMin === null && budgetMax === null) {
    throw new Error('Completează bugetul sau bifează „Buget necunoscut”');
  }
  validateRange(budgetMin, budgetMax, 'Buget');

  const roomsMin = nullableNumber(input.rooms_min ?? input.criteria?.nr_camere_min, 'Numărul minim de camere');
  const roomsMax = nullableNumber(input.rooms_max ?? input.criteria?.nr_camere_max, 'Numărul maxim de camere');
  const usableAreaMin = nullableNumber(input.usable_area_min ?? input.criteria?.suprafata_min, 'Suprafața utilă minimă');
  const usableAreaMax = nullableNumber(input.usable_area_max ?? input.criteria?.suprafata_max, 'Suprafața utilă maximă');
  const landAreaMin = nullableNumber(input.land_area_min ?? input.criteria?.teren_min, 'Suprafața minimă de teren');
  const landAreaMax = nullableNumber(input.land_area_max ?? input.criteria?.teren_max, 'Suprafața maximă de teren');
  validateRange(roomsMin, roomsMax, 'Camere');
  validateRange(usableAreaMin, usableAreaMax, 'Suprafață utilă');
  validateRange(landAreaMin, landAreaMax, 'Suprafață teren');

  const counties = normalizedList(input.counties, 10, 'Județele');
  const cities = normalizedList(input.cities, 30, 'Localitățile');
  const zones = normalizedList(input.zones, 30, 'Zonele');
  const floorPreferences = normalizedList(input.floor_preferences, 20, 'Etajele');
  const radiusKm = nullableNumber(input.radius_km, 'Raza');
  if (radiusKm !== null && radiusKm > 250) throw new Error('Raza nu poate depăși 250 km');

  const currencyText = nullableText(input.currency)?.toUpperCase() || 'EUR';
  if (currencyText !== 'EUR' && currencyText !== 'RON') throw new Error('Moneda este invalidă');

  const furnished = nullableText(input.furnished_preference);
  const financing = nullableText(input.financing);
  const specialRequirements = nullableText(input.special_requirements);
  const notes = nullableText(input.notes);
  const deadlineDate = dateOnly(input.deadline_date);

  const criteria: Record<string, unknown> = {
    ...(input.criteria || {}),
    intent,
    property_types: propertyTypes,
    counties,
    cities,
    zones,
    radius_km: radiusKm,
    budget_unknown: budgetUnknown,
    rooms_min: roomsMin,
    rooms_max: roomsMax,
    usable_area_min: usableAreaMin,
    usable_area_max: usableAreaMax,
    land_area_min: landAreaMin,
    land_area_max: landAreaMax,
    floor_preferences: floorPreferences,
    furnished_preference: furnished,
    parking_required: input.parking_required === true,
    financing,
    deadline_date: deadlineDate,
    special_requirements: specialRequirements,
  };

  return {
    contact_id: nullableId(input.contact_id),
    agent_id: nullableId(input.agent_id),
    intent,
    transaction: intentTransaction(intent),
    category: propertyTypes[0] as typeof DEMAND_PROPERTY_TYPES[number],
    property_types: propertyTypes,
    budget_min: budgetMin,
    budget_max: budgetMax,
    budget_unknown: budgetUnknown,
    currency: currencyText,
    counties,
    cities,
    zones,
    radius_km: radiusKm,
    rooms_min: roomsMin,
    rooms_max: roomsMax,
    usable_area_min: usableAreaMin,
    usable_area_max: usableAreaMax,
    land_area_min: landAreaMin,
    land_area_max: landAreaMax,
    floor_preferences: floorPreferences,
    furnished_preference: furnished,
    parking_required: input.parking_required === true,
    financing,
    deadline_date: deadlineDate,
    special_requirements: specialRequirements,
    source: nullableText(input.source),
    notes,
    criteria,
  };
}
