export const MATCH_SCORE_VERSION = 'demand-v2';

export type MatchStatus = 'matched' | 'unmatched' | 'unknown';

export interface MatchExplanation {
  key: string;
  label: string;
  status: MatchStatus;
  message: string;
  weight: number;
  requested?: string | number | boolean | null;
  actual?: string | number | boolean | null;
}

export interface DemandMatchInput {
  category?: string | null;
  property_types?: string[] | null;
  transaction?: string | null;
  intent?: string | null;
  budget_min?: number | null;
  budget_max?: number | null;
  budget_unknown?: boolean | null;
  currency?: string | null;
  cities?: string[] | null;
  counties?: string[] | null;
  zones?: string[] | null;
  radius_km?: number | null;
  rooms_min?: number | null;
  rooms_max?: number | null;
  usable_area_min?: number | null;
  usable_area_max?: number | null;
  land_area_min?: number | null;
  land_area_max?: number | null;
  floor_preferences?: string[] | null;
  furnished_preference?: string | null;
  parking_required?: boolean | null;
  special_requirements?: string | null;
  criteria?: Record<string, unknown> | null;
}

export interface PropertyMatchInput {
  category?: string | null;
  transaction?: string | null;
  city?: string | null;
  county?: string | null;
  zone?: string | null;
  price?: number | null;
  currency?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  surface_useful?: number | null;
  surface_land?: number | null;
  attributes?: Record<string, unknown> | null;
}

export interface MatchScoreResult {
  score: number;
  coverage: number;
  eligible: boolean;
  details: Record<string, string>;
  explanations: MatchExplanation[];
  matched: string[];
  unmatched: string[];
  unknown: string[];
  price_difference: number | null;
  reason: string;
  score_version: typeof MATCH_SCORE_VERSION;
}

export function normalizeMatchKey(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLocaleLowerCase('ro-RO')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ș/g, 's')
    .replace(/ț/g, 't')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function array(value: unknown): string[] {
  return Array.isArray(value)
    ? [...new Set(value.map(normalizeMatchKey).filter(Boolean))]
    : [];
}

function number(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string | null {
  const normalized = String(value ?? '').trim();
  return normalized || null;
}

function attribute(property: PropertyMatchInput, ...keys: string[]): unknown {
  const attrs = property.attributes || {};
  for (const key of keys) {
    const value = attrs[key];
    if (value !== null && value !== undefined && value !== '') return value;
  }
  return null;
}

function demandNumber(demand: DemandMatchInput, column: keyof DemandMatchInput, ...legacyKeys: string[]): number | null {
  const direct = number(demand[column]);
  if (direct !== null) return direct;
  const criteria = demand.criteria || {};
  for (const key of legacyKeys) {
    const value = number(criteria[key]);
    if (value !== null) return value;
  }
  return null;
}

function propertyTransaction(demand: DemandMatchInput): string {
  const direct = normalizeMatchKey(demand.transaction);
  if (direct) return direct;
  const intent = normalizeMatchKey(demand.intent);
  return intent === 'inchiriere' || intent === 'oferire spre inchiriere' || intent === 'oferire inchiriere'
    ? 'inchiriere'
    : 'vanzare';
}

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const dLat = radians(lat2 - lat1);
  const dLon = radians(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(radians(lat1)) * Math.cos(radians(lat2)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatRange(min: number | null, max: number | null, suffix = ''): string {
  if (min !== null && max !== null) return `${min}–${max}${suffix}`;
  if (min !== null) return `minimum ${min}${suffix}`;
  if (max !== null) return `maximum ${max}${suffix}`;
  return 'nespecificat';
}

export function scoreMatch(property: PropertyMatchInput, demand: DemandMatchInput): MatchScoreResult {
  const explanations: MatchExplanation[] = [];
  const blocking = new Set<string>();
  let possibleWeight = 0;
  let earnedWeight = 0;
  let evaluatedWeight = 0;

  const add = (
    key: string,
    label: string,
    status: MatchStatus,
    message: string,
    weight: number,
    earned = status === 'matched' ? weight : 0,
    requested?: MatchExplanation['requested'],
    actual?: MatchExplanation['actual'],
    isBlocking = false,
  ) => {
    possibleWeight += weight;
    if (status !== 'unknown') evaluatedWeight += weight;
    earnedWeight += Math.max(0, Math.min(weight, earned));
    explanations.push({ key, label, status, message, weight, requested, actual });
    if (isBlocking && status === 'unmatched') blocking.add(key);
  };

  const requestedTypes = array(demand.property_types?.length ? demand.property_types : [demand.category]);
  const actualType = normalizeMatchKey(property.category);
  if (requestedTypes.length > 0) {
    if (!actualType) add('property_type', 'Tip', 'unknown', 'Tipul proprietății nu este completat.', 20, 0, requestedTypes.join(', '), null);
    else if (requestedTypes.includes(actualType)) add('property_type', 'Tip', 'matched', `Tip potrivit: ${property.category}.`, 20, 20, requestedTypes.join(', '), property.category);
    else add('property_type', 'Tip', 'unmatched', `Tipul ${property.category || 'necunoscut'} nu este între cele cerute.`, 20, 0, requestedTypes.join(', '), property.category, true);
  }

  const requestedTransaction = propertyTransaction(demand);
  const actualTransaction = normalizeMatchKey(property.transaction || attribute(property, 'tip_tranzactie', 'tip_oferta'));
  if (requestedTransaction) {
    if (!actualTransaction) add('transaction', 'Tranzacție', 'unknown', 'Tranzacția proprietății nu este completată.', 10, 0, requestedTransaction, null);
    else if (actualTransaction.includes(requestedTransaction)) add('transaction', 'Tranzacție', 'matched', `Tranzacție potrivită: ${requestedTransaction}.`, 10, 10, requestedTransaction, actualTransaction);
    else add('transaction', 'Tranzacție', 'unmatched', `Se caută ${requestedTransaction}, proprietatea este ${actualTransaction}.`, 10, 0, requestedTransaction, actualTransaction, true);
  }

  const requestedCities = array(demand.cities);
  const requestedCounties = array(demand.counties);
  const requestedZones = array(demand.zones);
  const actualCity = normalizeMatchKey(property.city || attribute(property, 'localitate', 'oras'));
  const actualCounty = normalizeMatchKey(property.county || attribute(property, 'judet'));
  const actualZone = normalizeMatchKey(property.zone || attribute(property, 'zona', 'cartier'));

  if (requestedCities.length > 0) {
    if (!actualCity) add('city', 'Localitate', 'unknown', 'Localitatea proprietății lipsește.', 20, 0, requestedCities.join(', '), null);
    else if (requestedCities.includes(actualCity)) add('city', 'Localitate', 'matched', `Localitate potrivită: ${property.city}.`, 20, 20, requestedCities.join(', '), property.city);
    else add('city', 'Localitate', 'unmatched', `Localitatea ${property.city || 'necunoscută'} nu este în lista clientului.`, 20, 0, requestedCities.join(', '), property.city, true);
  } else if (requestedCounties.length > 0) {
    if (!actualCounty) add('county', 'Județ', 'unknown', 'Județul proprietății lipsește.', 12, 0, requestedCounties.join(', '), null);
    else if (requestedCounties.includes(actualCounty)) add('county', 'Județ', 'matched', `Județ potrivit: ${property.county}.`, 12, 12, requestedCounties.join(', '), property.county);
    else add('county', 'Județ', 'unmatched', `Județul ${property.county || 'necunoscut'} nu este între cele cerute.`, 12, 0, requestedCounties.join(', '), property.county, true);
  }

  if (requestedZones.length > 0) {
    if (!actualZone) add('zone', 'Zonă', 'unknown', 'Zona proprietății nu este completată.', 8, 0, requestedZones.join(', '), null);
    else if (requestedZones.includes(actualZone)) add('zone', 'Zonă', 'matched', `Zonă potrivită: ${property.zone || attribute(property, 'zona', 'cartier')}.`, 8, 8, requestedZones.join(', '), actualZone);
    else add('zone', 'Zonă', 'unmatched', `Zona ${property.zone || actualZone} diferă de preferință.`, 8, 0, requestedZones.join(', '), actualZone);
  }

  const radius = number(demand.radius_km);
  if (radius !== null && radius > 0) {
    const criteria = demand.criteria || {};
    const centerLat = number(criteria.latitude ?? criteria.lat);
    const centerLon = number(criteria.longitude ?? criteria.lon);
    const propertyLat = number(property.latitude ?? attribute(property, 'lat'));
    const propertyLon = number(property.longitude ?? attribute(property, 'lon'));
    if (centerLat === null || centerLon === null || propertyLat === null || propertyLon === null) {
      add('radius', 'Rază', 'unknown', 'Raza nu poate fi calculată deoarece lipsesc coordonate.', 8, 0, radius, null);
    } else {
      const distance = haversineKm(centerLat, centerLon, propertyLat, propertyLon);
      if (distance <= radius) add('radius', 'Rază', 'matched', `Proprietatea este la ${distance.toFixed(1)} km de punctul ales.`, 8, 8, radius, Number(distance.toFixed(1)));
      else add('radius', 'Rază', 'unmatched', `Distanța este ${distance.toFixed(1)} km, peste raza de ${radius} km.`, 8, 0, radius, Number(distance.toFixed(1)));
    }
  }

  let priceDifference: number | null = null;
  const budgetMin = number(demand.budget_min);
  const budgetMax = number(demand.budget_max);
  if (!demand.budget_unknown && (budgetMin !== null || budgetMax !== null)) {
    const propertyPrice = number(property.price);
    const requestedCurrency = normalizeMatchKey(demand.currency || 'EUR');
    const actualCurrency = normalizeMatchKey(property.currency || attribute(property, 'currency') || 'EUR');
    if (propertyPrice === null) {
      add('price', 'Preț', 'unknown', 'Prețul proprietății nu este completat.', 20, 0, formatRange(budgetMin, budgetMax), null);
    } else if (requestedCurrency !== actualCurrency) {
      add('price', 'Preț', 'unknown', `Monede diferite (${demand.currency || 'EUR'} / ${property.currency || 'EUR'}); este necesară conversia.`, 20, 0, requestedCurrency, actualCurrency);
    } else {
      if (budgetMin !== null && propertyPrice < budgetMin) priceDifference = propertyPrice - budgetMin;
      else if (budgetMax !== null && propertyPrice > budgetMax) priceDifference = propertyPrice - budgetMax;
      else priceDifference = 0;

      if (priceDifference === 0) {
        add('price', 'Preț', 'matched', `Prețul este în bugetul ${formatRange(budgetMin, budgetMax, ` ${demand.currency || 'EUR'}`)}.`, 20, 20, formatRange(budgetMin, budgetMax), propertyPrice);
      } else {
        const boundary = priceDifference > 0 ? budgetMax : budgetMin;
        const deviation = boundary && boundary > 0 ? Math.abs(priceDifference) / boundary : 1;
        const partial = deviation <= 0.1 ? 12 : deviation <= 0.2 ? 6 : 0;
        add('price', 'Preț', 'unmatched', `Diferență față de buget: ${priceDifference > 0 ? '+' : ''}${priceDifference.toLocaleString('ro-RO')} ${demand.currency || 'EUR'}.`, 20, partial, formatRange(budgetMin, budgetMax), propertyPrice);
      }
    }
  }

  const rangeChecks: Array<{
    key: string; label: string; weight: number; min: number | null; max: number | null;
    actual: number | null; suffix: string;
  }> = [
    {
      key: 'rooms', label: 'Camere', weight: 8,
      min: demandNumber(demand, 'rooms_min', 'nr_camere_min', 'nr_camere'),
      max: demandNumber(demand, 'rooms_max', 'nr_camere_max'),
      actual: number(attribute(property, 'nr_camere', 'camere')), suffix: '',
    },
    {
      key: 'usable_area', label: 'Suprafață utilă', weight: 8,
      min: demandNumber(demand, 'usable_area_min', 'suprafata_min', 'sup_utila'),
      max: demandNumber(demand, 'usable_area_max', 'suprafata_max'),
      actual: number(property.surface_useful ?? attribute(property, 'sup_utila', 'suprafata_utila', 'suprafata')), suffix: ' mp',
    },
    {
      key: 'land_area', label: 'Teren', weight: 8,
      min: demandNumber(demand, 'land_area_min', 'teren_min', 'sup_teren_min', 'sup_teren'),
      max: demandNumber(demand, 'land_area_max', 'teren_max', 'sup_teren_max'),
      actual: number(property.surface_land ?? attribute(property, 'sup_teren', 'suprafata_teren')), suffix: ' mp',
    },
  ];

  for (const check of rangeChecks) {
    if (check.min === null && check.max === null) continue;
    const requested = formatRange(check.min, check.max, check.suffix);
    if (check.actual === null) add(check.key, check.label, 'unknown', `${check.label} nu este completată la proprietate.`, check.weight, 0, requested, null);
    else if ((check.min === null || check.actual >= check.min) && (check.max === null || check.actual <= check.max)) {
      add(check.key, check.label, 'matched', `${check.label}: ${check.actual}${check.suffix}, în interval.`, check.weight, check.weight, requested, check.actual);
    } else add(check.key, check.label, 'unmatched', `${check.label}: ${check.actual}${check.suffix}, cerut ${requested}.`, check.weight, 0, requested, check.actual);
  }

  const floors = array(demand.floor_preferences || (demand.criteria?.floor_preferences as unknown));
  const floorMin = number(demand.criteria?.etaj_min);
  const floorMax = number(demand.criteria?.etaj_max);
  const propertyFloorValue = attribute(property, 'etaj');
  const propertyFloorNumber = number(propertyFloorValue);
  const propertyFloor = normalizeMatchKey(propertyFloorValue);
  if (floors.length > 0 || floorMin !== null || floorMax !== null) {
    const requested = floors.length > 0 ? floors.join(', ') : formatRange(floorMin, floorMax);
    if (!propertyFloor && propertyFloorNumber === null) add('floor', 'Etaj', 'unknown', 'Etajul proprietății nu este completat.', 4, 0, requested, null);
    else {
      const listMatch = floors.length === 0 || floors.includes(propertyFloor) || floors.includes(String(propertyFloorNumber));
      const rangeMatch = propertyFloorNumber === null
        ? floorMin === null && floorMax === null
        : (floorMin === null || propertyFloorNumber >= floorMin) && (floorMax === null || propertyFloorNumber <= floorMax);
      if (listMatch && rangeMatch) add('floor', 'Etaj', 'matched', `Etaj potrivit: ${String(propertyFloorValue)}.`, 4, 4, requested, String(propertyFloorValue));
      else add('floor', 'Etaj', 'unmatched', `Etaj ${String(propertyFloorValue)}, preferință ${requested}.`, 4, 0, requested, String(propertyFloorValue));
    }
  }

  const furnished = normalizeMatchKey(demand.furnished_preference);
  if (furnished && furnished !== 'oricare' && furnished !== 'indiferent') {
    const actual = normalizeMatchKey(attribute(property, 'mobilat'));
    if (!actual) add('furnished', 'Mobilare', 'unknown', 'Mobilarea proprietății nu este completată.', 4, 0, furnished, null);
    else if (actual.includes(furnished) || furnished.includes(actual)) add('furnished', 'Mobilare', 'matched', `Mobilare potrivită: ${String(attribute(property, 'mobilat'))}.`, 4, 4, furnished, actual);
    else add('furnished', 'Mobilare', 'unmatched', `Mobilare ${String(attribute(property, 'mobilat'))}, cerut ${demand.furnished_preference}.`, 4, 0, furnished, actual);
  }

  if (demand.parking_required === true) {
    const spaces = number(attribute(property, 'nr_parcare'));
    const facilities = attribute(property, 'dotari') as Record<string, unknown> | null;
    const hasParking = (spaces !== null && spaces > 0) || facilities?.garaj === true || facilities?.parcare === true;
    if (hasParking) add('parking', 'Parcare', 'matched', 'Proprietatea are parcare sau garaj.', 4, 4, true, true);
    else add('parking', 'Parcare', 'unmatched', 'Nu este confirmată o parcare sau un garaj.', 4, 0, true, false);
  }

  if (text(demand.special_requirements)) {
    add('special_requirements', 'Cerințe speciale', 'unknown', 'Cerințele speciale necesită verificarea agentului.', 0, 0, demand.special_requirements, null);
  }

  const score = possibleWeight > 0 ? Math.round((earnedWeight / possibleWeight) * 100) : 0;
  const coverage = possibleWeight > 0 ? Math.round((evaluatedWeight / possibleWeight) * 100) : 0;
  const details = Object.fromEntries(explanations.map((item) => [item.key, item.message]));
  const matched = explanations.filter((item) => item.status === 'matched').map((item) => item.message);
  const unmatched = explanations.filter((item) => item.status === 'unmatched').map((item) => item.message);
  const unknown = explanations.filter((item) => item.status === 'unknown').map((item) => item.message);
  const reasonParts = [...unmatched, ...matched, ...unknown].slice(0, 3);

  return {
    score,
    coverage,
    eligible: possibleWeight > 0 && blocking.size === 0,
    details,
    explanations,
    matched,
    unmatched,
    unknown,
    price_difference: priceDifference,
    reason: reasonParts.join(' ' ) || 'Cererea nu are suficiente criterii pentru matching.',
    score_version: MATCH_SCORE_VERSION,
  };
}
