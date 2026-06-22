export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function scorePropertyAgainstDemand(property: any, demand: any): { score: number; details: Record<string, string>; categoryMatch: boolean; cityMatch: boolean; locationMatch: boolean } {
  let score = 0;
  const details: Record<string, string> = {};
  const c = demand.criteria || {};
  let categoryMatch = false;
  let cityMatch = false;

  // Categorie (25 pts)
  if (property.category === demand.category) {
    score += 25;
    details.categorie = '✓ Potrivit';
    categoryMatch = true;
  } else {
    details.categorie = `Cerut: ${demand.category?.replace(/_/g, ' ')}, prop: ${property.category?.replace(/_/g, ' ')}`;
  }

  // Tip tranzactie (10 pts)
  const propTranz = property.attributes?.tip_tranzactie || property.transaction || '';
  const demTranz = demand.transaction || '';
  if (!demTranz || !propTranz || propTranz === demTranz) {
    score += 10;
    details.tranzactie = demTranz ? '✓ Potrivit' : 'Nespecificat';
  } else {
    details.tranzactie = `Cerut: ${demTranz}, prop: ${propTranz}`;
  }

  // Oras (20 pts) — demand.cities is an array
  const demCities: string[] = (demand.cities || []).map((s: string) => s.toLowerCase().trim());
  const propCity = (property.city || '').toLowerCase().trim();
  if (demCities.length > 0 && propCity) {
    const match = demCities.some(dc => propCity.includes(dc) || dc.includes(propCity));
    if (match) {
      score += 20;
      details.oras = '✓ Potrivit';
      cityMatch = true;
    } else {
      details.oras = `Cerut: ${demand.cities?.join(', ')}, prop: ${property.city}`;
    }
  } else {
    score += 10;
    details.oras = 'Nespecificat';
  }

  // Judet (10 pts) — demand.counties is an array
  let countyMatch = false;
  const demCounties: string[] = (demand.counties || []).map((s: string) => s.toLowerCase().trim());
  const propCounty = (property.county || '').toLowerCase().trim();
  if (demCounties.length > 0 && propCounty) {
    const match = demCounties.some(dc => propCounty.includes(dc) || dc.includes(propCounty));
    if (match) {
      score += 10;
      details.judet = '✓ Potrivit';
      countyMatch = true;
    } else {
      details.judet = `Cerut: ${demand.counties?.join(', ')}, prop: ${property.county}`;
    }
  } else {
    score += 5;
    details.judet = 'Nespecificat';
  }

  // Location relevance: if the demand names specific cities, the property's city
  // must be one of them; otherwise fall back to the county (most demands are only
  // county-level). A demand for "Holbav" never matches a Făgăraș property, but a
  // county-wide "Brașov" demand does.
  const locationMatch = demCities.length > 0 ? cityMatch : countyMatch;

  // Pret (20 pts) — budget_min / budget_max
  const propPrice = property.price || 0;
  const minP = demand.budget_min || 0;
  const maxP = demand.budget_max || Infinity;
  if (propPrice >= minP && propPrice <= maxP) {
    score += 20;
    details.pret = '✓ In range';
  } else if (propPrice >= minP * 0.9 && propPrice <= maxP * 1.1) {
    score += 12;
    details.pret = 'Aproape (+/-10%)';
  } else if (minP === 0 && maxP === Infinity) {
    score += 10;
    details.pret = 'Nespecificat';
  } else {
    details.pret = `${propPrice.toLocaleString()} — cerut ${minP ? minP.toLocaleString() : '0'}-${maxP === Infinity ? '∞' : maxP.toLocaleString()}`;
  }

  // Suprafata (10 pts)
  const propSup = property.attributes?.sup_utila || property.attributes?.suprafata || 0;
  const minSup = c.suprafata_min || 0;
  const maxSup = c.suprafata_max || Infinity;
  if (propSup && propSup >= minSup && propSup <= maxSup) {
    score += 10;
    details.suprafata = `✓ ${propSup} mp`;
  } else if (!minSup && maxSup === Infinity) {
    details.suprafata = 'Nespecificat';
  } else if (propSup) {
    details.suprafata = `${propSup} mp — cerut ${minSup}-${maxSup === Infinity ? '+' : maxSup}mp`;
  }

  // Camere (5 pts)
  const propCamere = property.attributes?.nr_camere || 0;
  const minCam = c.nr_camere_min || 0;
  const maxCam = c.nr_camere_max || Infinity;
  if (propCamere && propCamere >= minCam && propCamere <= maxCam) {
    score += 5;
    details.camere = `✓ ${propCamere} cam`;
  } else if (!minCam && maxCam === Infinity) {
    details.camere = 'Nespecificat';
  } else if (propCamere) {
    details.camere = `${propCamere} cam — cerut ${minCam}-${maxCam === Infinity ? '+' : maxCam}`;
  }

  return { score: Math.min(100, Math.round(score)), details, categoryMatch, cityMatch, locationMatch };
}

export async function GET(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const { searchParams } = new URL(request.url);
    const propertyId = searchParams.get('property_id');
    if (!propertyId) return Response.json({ error: 'property_id lipsa' }, { status: 400 });

    const { data: property } = await admin
      .from('properties')
      .select('id, internal_code, title, city, county, price, currency, category, attributes, transaction')
      .eq('id', propertyId)
      .eq('agency_id', profile.agency_id)
      .single();
    if (!property) return Response.json({ error: 'Proprietate negasita' }, { status: 404 });

    const { data: demands } = await admin
      .from('demands')
      .select('*')
      .eq('agency_id', profile.agency_id)
      .order('created_at', { ascending: false });

    if (!demands || demands.length === 0) return Response.json({ matches: [] });

    const scored = demands
      .map((d) => ({ ...d, ...scorePropertyAgainstDemand(property, d) }))
      // Hard requirement: only demands of the SAME category AND the same location
      // (city when the demand names one, else the county). Everything else is noise.
      .filter((d) => d.categoryMatch && d.locationMatch)
      .sort((a, b) => b.score - a.score);

    return Response.json({ matches: scored });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
