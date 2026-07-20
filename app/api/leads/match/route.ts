export const dynamic = 'force-dynamic';

import { scoreMatch } from '@/lib/match-score';
import { requireApiAuth } from '@/lib/server/api-auth';

// Potriviri proprietăți pentru un client (după criteriile lui de căutare).
export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'leads', action: 'view' });
  if (!auth.ok) return auth.response;
  try {
    const { admin, agencyId } = auth.context;

    const clientId = new URL(request.url).searchParams.get('client_id');
    if (!clientId) return Response.json({ error: 'client_id lipsă' }, { status: 400 });

    const { data: client } = await admin
      .from('leads').select('*').eq('id', clientId).eq('agency_id', agencyId).single();
    if (!client) return Response.json({ error: 'Client negăsit' }, { status: 404 });

    const criteria = {
      category: client.category,
      transaction: client.transaction,
      budget_min: client.budget_min,
      budget_max: client.budget_max,
      cities: client.city ? [client.city] : [],
      counties: client.county ? [client.county] : [],
      criteria: client.criteria || {},
    };

    const { data: properties } = await admin
      .from('properties')
      .select('id, internal_code, title, city, county, price, currency, category, transaction, attributes, status')
      .eq('agency_id', agencyId)
      .eq('status', 'activa');

    if (!properties || properties.length === 0) return Response.json({ matches: [] });

    const scored = properties
      .map((p) => ({ ...p, ...scoreMatch(p, criteria) }))
      .filter((p) => p.score >= 30)
      .sort((a, b) => b.score - a.score)
      .slice(0, 12);

    return Response.json({ matches: scored });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
