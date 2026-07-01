export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import { scoreMatch } from '@/lib/match-score';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Potriviri proprietăți pentru un client (după criteriile lui de căutare).
export async function GET(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const clientId = new URL(request.url).searchParams.get('client_id');
    if (!clientId) return Response.json({ error: 'client_id lipsă' }, { status: 400 });

    const { data: client } = await admin
      .from('leads').select('*').eq('id', clientId).eq('agency_id', profile.agency_id).single();
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
      .eq('agency_id', profile.agency_id)
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
