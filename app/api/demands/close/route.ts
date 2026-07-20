export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

const VALID_CLOSE_STATUSES = ['indeplinita', 'anulata'];

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'demands', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;
    const body = await request.json();
    const { id, close_status, close_comment } = body;

    if (!id) return Response.json({ error: 'ID cerere lipsa' }, { status: 400 });
    if (!close_status || !VALID_CLOSE_STATUSES.includes(close_status)) {
      return Response.json({ error: 'Status de inchidere invalid. Permis: indeplinita, anulata' }, { status: 400 });
    }
    if (!close_comment || close_comment.trim().length < 5) {
      return Response.json({ error: 'Comentariul de inchidere este obligatoriu (minim 5 caractere)' }, { status: 400 });
    }

    const { data, error } = await admin
      .from('demands')
      .update({
        status: close_status,
        notes: close_comment.trim(),
        updated_at: new Date().toISOString(),
      })
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
