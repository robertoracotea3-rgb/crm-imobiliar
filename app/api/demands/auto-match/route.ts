export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

interface MatchProperty {
  category?: string | null;
  city?: string | null;
  county?: string | null;
  price?: number | null;
  attributes?: {
    tip_tranzactie?: string;
    suprafata_utila?: number;
    suprafata?: number;
    sup_utila?: number;
    nr_camere?: number;
  } | null;
}

interface MatchDemand {
  category?: string | null;
  transaction?: string | null;
  cities?: string[] | null;
  counties?: string[] | null;
  budget_min?: number | null;
  budget_max?: number | null;
  criteria?: {
    suprafata_min?: number;
    suprafata_max?: number;
    nr_camere_min?: number;
    nr_camere_max?: number;
  } | null;
}

function scoreMatch(property: MatchProperty, demand: MatchDemand): { score: number; details: Record<string, string> } {
  let score = 0;
  const details: Record<string, string> = {};
  const c = demand.criteria || {};

  // Categorie (25 pts)
  if (property.category === demand.category) {
    score += 25;
    details.categorie = 'Potrivit';
  } else {
    details.categorie = `Cerut: ${demand.category?.replace(/_/g, ' ')}, prop: ${property.category?.replace(/_/g, ' ')}`;
  }

  // Tip tranzactie (10 pts)
  const propTranz = property.attributes?.tip_tranzactie || '';
  const demTranz = demand.transaction || '';
  if (!demTranz || !propTranz || propTranz === demTranz) {
    score += 10;
    details.tranzactie = demTranz ? 'Potrivit' : 'Nespecificat';
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
      details.oras = 'Potrivit';
    } else {
      details.oras = `Cerut: ${demand.cities?.join(', ')}, prop: ${property.city}`;
    }
  } else {
    score += 10;
    details.oras = 'Nespecificat';
  }

  // Judet (10 pts) — demand.counties is an array
  const demCounties: string[] = (demand.counties || []).map((s: string) => s.toLowerCase().trim());
  const propCounty = (property.county || '').toLowerCase().trim();
  if (demCounties.length > 0 && propCounty) {
    const match = demCounties.some(dc => propCounty.includes(dc) || dc.includes(propCounty));
    if (match) {
      score += 10;
      details.judet = 'Potrivit';
    } else {
      details.judet = `Cerut: ${demand.counties?.join(', ')}, prop: ${property.county}`;
    }
  } else {
    score += 5;
    details.judet = 'Nespecificat';
  }

  // Pret (20 pts) — budget_min / budget_max
  const propPrice = property.price || 0;
  const minP = demand.budget_min || 0;
  const maxP = demand.budget_max || Infinity;
  if (propPrice >= minP && propPrice <= maxP) {
    score += 20;
    details.pret = 'In range';
  } else if (propPrice >= minP * 0.9 && propPrice <= maxP * 1.1) {
    score += 12;
    details.pret = 'Aproape de range (+/-10%)';
  } else if (minP === 0 && maxP === Infinity) {
    score += 10;
    details.pret = 'Nespecificat';
  } else {
    details.pret = `Pret ${propPrice.toLocaleString()} in afara range-ului`;
  }

  // Suprafata (10 pts)
  const propSup = property.attributes?.suprafata_utila || property.attributes?.suprafata || 0;
  const minSup = c.suprafata_min || 0;
  const maxSup = c.suprafata_max || Infinity;
  if (propSup && propSup >= minSup && propSup <= maxSup) {
    score += 10;
    details.suprafata = `${propSup} mp — in range`;
  } else if (!minSup && maxSup === Infinity) {
    score += 5;
    details.suprafata = 'Nespecificat';
  } else if (propSup) {
    details.suprafata = `${propSup} mp — in afara range-ului`;
  }

  // Nr camere (5 pts)
  const propCamere = property.attributes?.nr_camere || 0;
  const minCam = c.nr_camere_min || 0;
  const maxCam = c.nr_camere_max || Infinity;
  if (propCamere && propCamere >= minCam && propCamere <= maxCam) {
    score += 5;
    details.camere = `${propCamere} cam — potrivit`;
  } else if (!minCam && maxCam === Infinity) {
    details.camere = 'Nespecificat';
  } else if (propCamere) {
    details.camere = `${propCamere} cam — cerut ${minCam}-${maxCam === Infinity ? '+' : maxCam}`;
  }

  return { score: Math.min(100, Math.round(score)), details };
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'demands', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;

    const { searchParams } = new URL(request.url);
    const demandId = searchParams.get('demand_id');
    if (!demandId) return Response.json({ error: 'demand_id lipsa' }, { status: 400 });

    const { data: demand } = await admin
      .from('demands')
      .select('*')
      .eq('id', demandId)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!demand) return Response.json({ error: 'Cerere negasita' }, { status: 404 });

    const { data: properties } = await admin
      .from('properties')
      .select('id, internal_code, title, city, county, price, currency, category, attributes, status')
      .eq('agency_id', agencyId)
      .eq('status', 'activa')
      .is('deleted_at', null);

    if (!properties || properties.length === 0) return Response.json({ matches: [] });

    const scored = properties
      .map((p) => ({ ...p, ...scoreMatch(p, demand) }))
      .filter((p) => p.score >= 30)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return Response.json({ matches: scored, demand });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
