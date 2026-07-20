export const dynamic = 'force-dynamic';

import { scoreMatch } from '@/lib/match-score';
import { requireApiAuth } from '@/lib/server/api-auth';

// Clienți potriviți pentru o proprietate (echivalentul „Cereri potrivite" din
// vechiul modul Cereri & Potriviri, acum bazat pe criteriile clienților unificați).
export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'properties', action: 'view' });
  if (!auth.ok) return auth.response;
  try {
    const { admin, agencyId } = auth.context;

    const propertyId = new URL(request.url).searchParams.get('property_id');
    if (!propertyId) return Response.json({ error: 'property_id lipsa' }, { status: 400 });

    const { data: property } = await admin
      .from('properties')
      .select('id, city, county, price, currency, category, attributes, transaction')
      .eq('id', propertyId)
      .eq('agency_id', agencyId)
      .single();
    if (!property) return Response.json({ error: 'Proprietate negasita' }, { status: 404 });

    // Doar clienți încă „în căutare" — cei câștigați/pierduți/retrași nu mai caută nimic.
    const { data: clients } = await admin
      .from('leads')
      .select('id, contact_name, city, county, category, transaction, budget_min, budget_max, currency, source, message, criteria, status')
      .eq('agency_id', agencyId)
      .not('status', 'in', '(withdrawn,lost,won)')
      .order('received_at', { ascending: false });

    if (!clients || clients.length === 0) return Response.json({ matches: [] });

    const propCity = (property.city || '').toLowerCase().trim();
    const propCounty = (property.county || '').toLowerCase().trim();

    const scored = clients
      .filter((c) => c.category === property.category) // hard requirement, ca la vechiul motor de cereri
      .map((c) => {
        const demCity = (c.city || '').toLowerCase().trim();
        const demCounty = (c.county || '').toLowerCase().trim();
        const cityMatch = !!demCity && (propCity.includes(demCity) || demCity.includes(propCity));
        const countyMatch = !!demCounty && (propCounty.includes(demCounty) || demCounty.includes(propCounty));
        const locationMatch = demCity ? cityMatch : countyMatch;

        const criteria = {
          category: c.category, transaction: c.transaction,
          budget_min: c.budget_min, budget_max: c.budget_max,
          cities: c.city ? [c.city] : [], counties: c.county ? [c.county] : [],
          criteria: c.criteria || {},
        };
        const { score, details } = scoreMatch(property, criteria);
        return { ...c, score, details, locationMatch };
      })
      .filter((c) => c.locationMatch && c.score >= 30)
      .sort((a, b) => b.score - a.score)
      .slice(0, 10);

    return Response.json({ matches: scored });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
