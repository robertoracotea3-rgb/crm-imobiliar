/* eslint-disable @typescript-eslint/no-explicit-any */
// Scor de potrivire proprietate ↔ criterii client. Extras din motorul de cereri
// (app/api/demands/auto-match) ca să fie reutilizat de potrivirile per-client.
// `criteria` are forma { category, transaction, budget_min, budget_max,
// cities: string[], counties: string[], suprafata_min/max, nr_camere_min/max }.
export function scoreMatch(property: any, criteria: any): { score: number; details: Record<string, string> } {
  let score = 0;
  const details: Record<string, string> = {};
  const c = criteria.criteria || criteria || {};

  // Categorie (25)
  if (property.category === criteria.category) { score += 25; details.categorie = 'Potrivit'; }
  else details.categorie = `Cerut: ${criteria.category?.replace(/_/g, ' ') || '—'}, prop: ${property.category?.replace(/_/g, ' ')}`;

  // Tranzacție (10)
  const propTranz = property.attributes?.tip_tranzactie || property.transaction || '';
  const demTranz = criteria.transaction || '';
  if (!demTranz || !propTranz || propTranz === demTranz) { score += 10; details.tranzactie = demTranz ? 'Potrivit' : 'Nespecificat'; }
  else details.tranzactie = `Cerut: ${demTranz}, prop: ${propTranz}`;

  // Oraș (20)
  const demCities: string[] = (criteria.cities || []).map((s: string) => s.toLowerCase().trim()).filter(Boolean);
  const propCity = (property.city || '').toLowerCase().trim();
  if (demCities.length > 0 && propCity) {
    if (demCities.some((dc) => propCity.includes(dc) || dc.includes(propCity))) { score += 20; details.oras = 'Potrivit'; }
    else details.oras = `Cerut: ${criteria.cities?.join(', ')}, prop: ${property.city}`;
  } else { score += 10; details.oras = 'Nespecificat'; }

  // Județ (10)
  const demCounties: string[] = (criteria.counties || []).map((s: string) => s.toLowerCase().trim()).filter(Boolean);
  const propCounty = (property.county || '').toLowerCase().trim();
  if (demCounties.length > 0 && propCounty) {
    if (demCounties.some((dc) => propCounty.includes(dc) || dc.includes(propCounty))) { score += 10; details.judet = 'Potrivit'; }
    else details.judet = `Cerut: ${criteria.counties?.join(', ')}, prop: ${property.county}`;
  } else { score += 5; details.judet = 'Nespecificat'; }

  // Preț (20)
  const propPrice = property.price || 0;
  const minP = criteria.budget_min || 0;
  const maxP = criteria.budget_max || Infinity;
  if (propPrice >= minP && propPrice <= maxP) { score += 20; details.pret = 'In range'; }
  else if (propPrice >= minP * 0.9 && propPrice <= maxP * 1.1) { score += 12; details.pret = 'Aproape de range (+/-10%)'; }
  else if (minP === 0 && maxP === Infinity) { score += 10; details.pret = 'Nespecificat'; }
  else details.pret = `Preț ${propPrice.toLocaleString()} în afara range-ului`;

  // Suprafață (10)
  const propSup = property.attributes?.sup_utila || property.attributes?.suprafata_utila || property.attributes?.suprafata || 0;
  const minSup = c.suprafata_min || 0;
  const maxSup = c.suprafata_max || Infinity;
  if (propSup && propSup >= minSup && propSup <= maxSup) { score += 10; details.suprafata = `${propSup} mp — in range`; }
  else if (!minSup && maxSup === Infinity) { score += 5; details.suprafata = 'Nespecificat'; }
  else if (propSup) details.suprafata = `${propSup} mp — in afara range-ului`;

  // Nr. camere (5)
  const propCamere = property.attributes?.nr_camere || 0;
  const minCam = c.nr_camere_min || 0;
  const maxCam = c.nr_camere_max || Infinity;
  if (propCamere && propCamere >= minCam && propCamere <= maxCam) { score += 5; details.camere = `${propCamere} cam — potrivit`; }
  else if (!minCam && maxCam === Infinity) details.camere = 'Nespecificat';
  else if (propCamere) details.camere = `${propCamere} cam — cerut ${minCam}-${maxCam === Infinity ? '+' : maxCam}`;

  return { score: Math.min(100, Math.round(score)), details };
}
