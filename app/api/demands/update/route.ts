export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

const VALID_STATUS = ['activa', 'inactiva', 'indeplinita', 'anulata'];

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'demands', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;
    const body = await request.json();
    const {
      id, status, notes, budget_min, budget_max, cities, counties,
      category, transaction, currency, source, criteria,
    } = body;

    if (!id) return Response.json({ error: 'ID lipsa' }, { status: 400 });
    if (status !== undefined && !VALID_STATUS.includes(status)) {
      return Response.json({ error: 'Status invalid' }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (status !== undefined) patch.status = status;
    if (notes !== undefined) patch.notes = notes || null;
    if (budget_min !== undefined) patch.budget_min = num(budget_min);
    if (budget_max !== undefined) patch.budget_max = num(budget_max);
    if (cities !== undefined) patch.cities = Array.isArray(cities) ? cities : null;
    if (counties !== undefined) patch.counties = Array.isArray(counties) ? counties : null;
    if (category !== undefined) patch.category = category || null;
    if (transaction !== undefined) patch.transaction = transaction || null;
    if (currency !== undefined) patch.currency = currency || null;
    if (source !== undefined) patch.source = source || null;
    if (criteria !== undefined) patch.criteria = criteria || null;

    if (Object.keys(patch).length === 0) {
      return Response.json({ error: 'Nicio modificare detectata' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('demands')
      .update(patch)
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ demand: data });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
