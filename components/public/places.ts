import { norm, type CardProperty } from './site';

/*
 * Approximate centres of the localities and Brașov districts Kira works in. The CRM never sends a street
 * or a number to the site, so a pin shows the area only, nudged a little per property so pins do not overlap.
 */
const LOCALITIES: Record<string, [number, number]> = {
  fagaras: [45.8417, 24.9731], brasov: [45.6427, 25.5887], victoria: [45.7300, 24.7069], sercaia: [45.8364, 25.1342],
  harseni: [45.7570, 25.0170], beclean: [45.8269, 24.9227], voila: [45.8100, 24.8320], recea: [45.7350, 24.9150],
  dragus: [45.7600, 24.7900], ucea: [45.7860, 24.6800], 'ucea de jos': [45.7860, 24.6800], 'ucea de sus': [45.7500, 24.6750],
  'sambata de sus': [45.7550, 24.8150], 'sambata de jos': [45.7780, 24.8120], cincu: [45.9200, 24.8050], dridif: [45.8100, 24.8850],
  mandra: [45.8110, 25.0500], sinca: [45.6800, 25.1700], 'sinca noua': [45.6700, 25.2300], lisa: [45.7300, 24.8600],
  vistea: [45.8000, 24.7300], parau: [45.8600, 25.1900], comana: [45.9700, 25.2500], hoghiz: [45.9900, 25.3000],
  rupea: [46.0400, 25.2200], codlea: [45.7000, 25.4500], ghimbav: [45.6600, 25.5100], sacele: [45.6200, 25.6900],
  rasnov: [45.5900, 25.4600], cristian: [45.6200, 25.4800], sanpetru: [45.7100, 25.6300], harman: [45.7200, 25.6800],
  prejmer: [45.7200, 25.7700], tarlungeni: [45.6300, 25.7600], zarnesti: [45.5600, 25.3100], predeal: [45.5000, 25.5800],
  bran: [45.5200, 25.3700], avrig: [45.7200, 24.3800], sibiu: [45.7900, 24.1500], 'poiana brasov': [45.5930, 25.5540],
};

const BRASOV_ZONES: Record<string, [number, number]> = {
  'centrul vechi': [45.6418, 25.5887], centru: [45.6460, 25.5940], schei: [45.6370, 25.5800], tractorul: [45.6600, 25.6100],
  coresi: [45.6640, 25.6080], astra: [45.6450, 25.6250], racadau: [45.6290, 25.5950], noua: [45.6390, 25.6450],
  bartolomeu: [45.6640, 25.5650], triaj: [45.6800, 25.6200], florilor: [45.6560, 25.6020], 'calea bucuresti': [45.6400, 25.6200],
  darste: [45.6280, 25.6600], avantgarden: [45.6780, 25.5590], stupini: [45.6930, 25.5900], gara: [45.6600, 25.6140],
  'centrul civic': [45.6510, 25.6020], grivitei: [45.6550, 25.6000], 'valea cetatii': [45.6200, 25.6200], 'poiana brasov': [45.5930, 25.5540],
  'timisul de jos': [45.5600, 25.5900], craiter: [45.6600, 25.5900], 'blumana': [45.6460, 25.5980],
};

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function find(table: Record<string, [number, number]>, value: string | null): [number, number] | null {
  if (!value) return null;
  const v = norm(value).replace(/[^a-z ]/g, ' ').replace(/\s+/g, ' ').trim();
  if (table[v]) return table[v];
  const key = Object.keys(table).find((k) => v.includes(k) || k.includes(v));
  return key ? table[key] : null;
}

/** Where to put the property's pin (its area, slightly offset), or null when the locality is unknown. */
export function approxPosition(p: Pick<CardProperty, 'id' | 'city' | 'zone'>): [number, number] | null {
  const city = p.city ? norm(p.city) : '';
  const base = (city.includes('brasov') && find(BRASOV_ZONES, p.zone)) || find(LOCALITIES, p.city);
  if (!base) return null;
  const h = hash(p.id);
  const angle = (h % 360) * (Math.PI / 180);
  const dist = 0.0015 + ((h >>> 9) % 100) / 100 * 0.0035; // roughly 150-550 m
  return [base[0] + Math.sin(angle) * dist, base[1] + Math.cos(angle) * dist * 1.4];
}
