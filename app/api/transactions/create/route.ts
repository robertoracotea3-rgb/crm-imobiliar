export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin
      .from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const body = await request.json();
    const { property_id, type, sale_price, currency, agency_commission, agent_commission, agent_id, closed_at, notes } = body;

    const { data, error } = await admin.from('transactions').insert({
      agency_id:         profile.agency_id,
      property_id:       property_id || null,
      agent_id:          agent_id || null,
      type:              type || 'vanzare',
      sale_price:        Number(sale_price) || 0,
      currency:          currency || 'EUR',
      agency_commission: Number(agency_commission) || 0,
      agent_commission:  Number(agent_commission) || 0,
      closed_at:         closed_at || new Date().toISOString().slice(0, 10),
      notes:             notes || null,
      created_by:        user.id,
    }).select().single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ transaction: data }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
