export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'demands', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { serviceAdmin, agencyId, user } = auth.context;
    const body = await request.json();
    const { id, close_comment } = body;
    const reasonCode = body.reason_code || (
      body.close_status === 'indeplinita'
        ? 'cumparat_prin_alta_parte'
        : 'alt_motiv'
    );

    if (!id) return Response.json({ error: 'ID cerere lipsă' }, { status: 400 });
    if (!close_comment || close_comment.trim().length < 5) {
      return Response.json({ error: 'Comentariul de închidere este obligatoriu (minim 5 caractere)' }, { status: 400 });
    }

    const { data, error } = await serviceAdmin.rpc('crm_review_demand', {
      p_agency_id: agencyId,
      p_actor_id: user.id,
      p_demand_id: id,
      p_action: 'close',
      p_reason_code: reasonCode,
      p_note: close_comment.trim(),
      p_next_action_type: null,
      p_next_action_at: null,
      p_idempotency_key: crypto.randomUUID(),
    });
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ review: data });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
