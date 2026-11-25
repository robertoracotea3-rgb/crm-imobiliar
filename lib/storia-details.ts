import { STORIA_TAXONOMY } from '@/lib/storia-taxonomy';

/*
 * Everything else the CRM knows about a property, as Storia takes it: what has a place in Storia's form goes as an
 * attribute (floor, year, condition, heating, appliances...); what has none (bathrooms, bathtub, microwave, "Renovat
 * recent"...) goes in "Alte detalii", at the end of the description. Nothing the agent filled in stays behind, except
 * what is never published (the street, the number, the owner, the internal notes).
 */

export type Details = {
  tranzactie?: string; tip?: string; bai?: number; suprafata?: number; suprafataTeren?: number;
  etaj?: number; etajeTotal?: number; an?: number; tipConstructie?: string; material?: string; stare?: string;
  incalzire?: string; geamuri?: string; disponibilDe?: string; descriere?: string;
  particularitati?: string[]; media?: string[]; facilitati?: string[]; siguranta?: string[]; baie?: string[]; inchiriere?: string[];
};
export type Attribute = { urn: string; value: string };
export type Family = 'apartments' | 'houses' | 'lots' | 'stores' | 'warehouses';

// CRM value -> Storia values to try, in order (the first one the category has).
const BUILDING: Record<string, string[]> = {
  'Bloc de apartamente': ['block'], 'Complex rezidențial': ['block'],
  'Casă individuală': ['detached', 'house', 'private-house'], 'Vilă': ['detached', 'house', 'private-house'],
  'Duplex': ['semi-detached', 'house', 'private-house'], 'Casă înșiruită': ['ribbon', 'private-house'], 'Clădire de birouri': ['office-building'],
};
const MATERIAL: Record<string, string[]> = {
  'Beton armat': ['reinforced-concrete', 'concrete'], 'Cărămidă': ['brick'], 'BCA': ['cellular-concrete'],
  'Panouri prefabricate': ['concrete-plate'], 'Lemn': ['wood'], 'Structură metalică': ['other'], 'Mixt': ['other'],
};
const STATUS: Record<string, string[]> = {
  'Construcție nouă': ['ready-to-use'], 'Renovat recent': ['ready-to-use'], 'Stare bună': ['ready-to-use'],
  'Necesită renovare': ['in-renovation'], 'La gri': ['to-complete'], 'La roșu': ['to-complete'],
};
const HEATING: Record<string, string[]> = {
  'Centrală proprie': ['gas'], 'Termoficare': ['urban'], 'Centrală de bloc': ['boiler-room'], 'Încălzire în pardoseală': ['other'],
  'Pompă de căldură': ['heat-pump', 'other'], 'Sobă / teracotă': ['tiled-stove', 'stove'], 'Calorifere electrice': ['electrical', 'electric'],
};
const WINDOWS: Record<string, string[]> = {
  'Termopan PVC': ['plastic'], 'Termopan aluminiu': ['aluminium'], 'Termopan lemn stratificat': ['wooden'], 'Lemn simplu': ['wooden'],
};
// A ticked box -> the attributes and values it can be, in order.
const TICKS: Record<string, [string, string][]> = {
  'Balcon': [['extras', 'balcony']], 'Terasă': [['extras', 'terrace']], 'Grădină': [['extras', 'garden']],
  'Pivniță / boxă': [['extras', 'basement']], 'Loc de parcare': [['extras', 'parking'], ['extras', 'garage']], 'Garaj': [['extras', 'garage']],
  'Lift': [['extras', 'lift'], ['extras', 'elevator']], 'Mobilat': [['equipment-types', 'furniture'], ['extras', 'furniture']],
  'Aer condiționat': [['extras', 'air-conditioning']], 'Bucătărie închisă': [['extras', 'separate-kitchen']],
  'Internet': [['media-types', 'internet']], 'Fibră optică': [['media-types', 'internet']],
  'TV prin cablu': [['media-types', 'cable-tv'], ['media-types', 'cable-television']], 'Telefon fix': [['media-types', 'phone']],
  'Mașină de spălat rufe': [['equipment-types', 'washing-machine']], 'Mașină de spălat vase': [['equipment-types', 'dishwasher']],
  'Frigider': [['equipment-types', 'fridge']], 'Aragaz / plită': [['equipment-types', 'stove']], 'Cuptor': [['equipment-types', 'oven']],
  'Televizor': [['equipment-types', 'tv']],
  'Interfon': [['security-types', 'entryphone']], 'Videointerfon': [['security-types', 'entryphone']],
  'Ușă antiefracție': [['security-types', 'anti-burglary-door']], 'Sistem de alarmă': [['security-types', 'alarm']],
  'Supraveghere video': [['security-types', 'monitoring']], 'Pază': [['security-types', 'monitoring']],
  'Rulouri exterioare': [['security-types', 'roller-shutters']], 'Complex închis': [['security-types', 'closed-area']],
  'Studenți acceptați': [['rent-to-students', 'yes']], 'Doar nefumători': [['extras', 'non-smokers-only']],
};
// What Storia's value says less than the CRM's: sent, and also written out in words.
const ALSO_IN_WORDS = new Set(['Complex rezidențial', 'Vilă', 'Structură metalică', 'Mixt', 'Construcție nouă', 'Renovat recent', 'La gri', 'La roșu',
  'Centrală proprie', 'Încălzire în pardoseală', 'Termopan lemn stratificat', 'Fibră optică', 'Videointerfon', 'Pază', 'Supraveghere video', 'Loc de parcare']);
const FLOORS = ['ground-floor', '1st-floor', '2nd-floor', '3rd-floor', '4th-floor', '5th-floor', '6th-floor', '7th-floor', '8th-floor', '9th-floor', '10th-floor'];

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');
const list = (v: unknown): string[] =>
  Array.isArray(v) ? Array.from(new Set(v.filter((x): x is string => typeof x === 'string' && !!x.trim()).map((x) => x.trim().slice(0, 80)))).slice(0, 40) : [];
const plain = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ');
const has = (allowed: string | undefined, value: string) => allowed !== undefined && allowed.split(' ').includes(value);

/** Storia's floor, or null when it has none for it. */
function floorValue(e: number): string | null {
  if (e === -1) return 'cellar';
  if (e === 100) return 'garret';
  if (!Number.isInteger(e) || e < 0) return null;
  return e > 10 ? '11th-floor-and-above' : FLOORS[e];
}

/** The optional attributes of the advert, and the lines for "Alte detalii". today: YYYY-MM-DD. */
export function storiaDetails(l: Details, fam: Family, today = new Date().toISOString().slice(0, 10)): { attributes: Attribute[]; lines: string[] } {
  const tax = STORIA_TAXONOMY[`${fam}-for-${l.tranzactie === 'inchiriere' ? 'rent' : 'sale'}`] || {};
  const attributes: Attribute[] = [];
  const lines: string[] = [];
  const put = (attr: string, value: string) => {
    const urn = `urn:concept:${attr}`;
    if (!attributes.some((x) => x.urn === urn && x.value === value)) attributes.push({ urn, value });
    return true;
  };
  /** A free value (a year, a date, a number of floors). */
  const free = (attr: string, value: string): boolean => tax[attr] === '' && put(attr, value);
  /** The first of these values that the category has. */
  const pick = (attr: string, values: string[]): boolean => {
    const v = values.find((x) => has(tax[attr], x));
    return v !== undefined && put(attr, `urn:concept:${v}`);
  };
  const say = (label: string, value: string) => void lines.push(`${label}: ${value}`);
  const one = (label: string, attrs: string[], map: Record<string, string[]>, value: string) => {
    if (!value) return;
    const sent = attrs.some((a) => pick(a, map[value] || []));
    if (!sent || ALSO_IN_WORDS.has(value)) say(label, value);
  };

  const bai = num(l.bai);
  if (bai && bai > 0) say('Băi', String(Math.round(bai)));

  if (fam !== 'lots') {
    const etaj = num(l.etaj), total = num(l.etajeTotal), an = num(l.an);
    if (etaj !== null && fam !== 'houses') {
      const v = floorValue(etaj);
      const sent = v !== null && pick('floor', [v]);
      if (!sent || etaj > 10) say('Etaj', etaj === 0 ? 'parter' : etaj === 100 ? 'mansardă' : etaj < 0 ? 'demisol' : String(etaj));
    }
    if (total !== null && total >= 1) {
      const n = Math.round(total);
      const sent = free('building-floors', String(n)) || pick('floors-in-building', [n === 1 ? 'one-floor' : n === 2 ? 'two-floors' : 'more']);
      if (!sent || (n > 2 && 'floors-in-building' in tax)) say('Etaje în clădire', String(n));
    } else if (total === 0) {
      pick('floors-in-building', ['ground-floor']);
    }
    if (an !== null && an > 1500 && an < 2100 && !free('construction-year', String(Math.round(an)))) say('An construcție', String(Math.round(an)));
    one('Tip construcție', ['building-type'], BUILDING, str(l.tipConstructie));
    one('Material', ['building-material'], MATERIAL, str(l.material));
    one('Stare', ['status'], STATUS, str(l.stare));
    const inc = str(l.incalzire);
    if (tax.heating === 'n y') {
      if (inc) {
        put('heating', inc === 'Fără încălzire' ? 'urn:concept:n' : 'urn:concept:y');
        say('Încălzire', inc);
      }
    } else {
      one('Încălzire', ['heating', 'heating-types'], HEATING, inc);
      if (inc && inc !== 'Fără încălzire') pick('extras', ['heating']);
    }
    one('Geamuri', ['windows-type'], WINDOWS, str(l.geamuri));
    if (str(l.tip) === 'Birou') pick('use-types', ['office']);
    else if (str(l.tip) === 'Spațiu comercial') pick('use-types', ['retail']);
  }
  const de = /^(\d{4})-(\d{2})-(\d{2})/.exec(str(l.disponibilDe));
  if (de && de[0] > today && !free('free-from', de[0])) say('Disponibil de la', `${de[3]}.${de[2]}.${de[1]}`);

  const rest: string[] = [];
  for (const t of [...list(l.particularitati), ...list(l.baie), ...list(l.media), ...list(l.facilitati), ...list(l.siguranta), ...list(l.inchiriere)]) {
    const v = (TICKS[t] || []).find(([a, x]) => has(tax[a], x));
    if (v) put(v[0], `urn:concept:${v[1]}`);
    if (!v || ALSO_IN_WORDS.has(t)) rest.push(t);
  }
  const said = plain(str(l.descriere));
  const news = Array.from(new Set(rest)).filter((t) => !said.includes(plain(t)));
  if (news.length) say('Dotări', news.join(', '));
  return { attributes, lines };
}
