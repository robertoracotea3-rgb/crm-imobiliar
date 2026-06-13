export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_STATUS = ['activa', 'inactiva', 'indeplinita', 'anulata'];

export async function PATCH(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const body = await request.json();
    const { id, status, notes, budget_min, budget_max, cities, counties,
            category, transaction, currency, source, criteria } = body;
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (status !== undefined && VALID_STATUS.includes(status)) patch.status = status;
    if (notes !== undefined) patch.notes = notes || null;
    if (budget_min !== undefined) patch.budget_min = budget_min ? Number(budget_min) : null;
    if (budget_max !== undefined) patch.budget_max = budget_max ? Number(budget_max) : null;
    if (cities !== undefined) patch.cities = Array.isArray(cities) ? cities : null;
    if (counties !== undefined) patch.counties = Array.isArray(counties) ? counties : null;
    if (category !== undefined) patch.category = category || null;
    if (transaction !== undefined) patch.transaction = transaction || null;
    if (currency !== undefined) patch.currency = currency || null;
    if (source !== undefined) patch.source = source || null;
    if (criteria !== undefined) patch.criteria = criteria || null;

    if (Object.keys(patch).length === 0) {
      return Response.json({ error: 'Nicio modificare detectată' }, { status: 400 });
    }

    const { data, error } = await admin.from('demands')
      .update(patch)
      .eq('id', id)
      .eq('agency_id', profile.agency_id)
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ demand: data });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
