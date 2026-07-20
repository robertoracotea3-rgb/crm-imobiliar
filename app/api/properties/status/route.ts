export const dynamic = 'force-dynamic';

import { getUserName, logActivity } from '@/lib/activity-log';
import { requireApiAuth } from '@/lib/server/api-auth';

const VALID_STATUSES = ['activa', 'rezervata', 'tranzactionata', 'inchiriata', 'retrasa', 'expirata', 'draft'];
const STATUS_LABELS: Record<string, string> = {
  activa: 'Activă',
  rezervata: 'Rezervată',
  tranzactionata: 'Tranzacționată',
  inchiriata: 'Închiriată',
  retrasa: 'Retrasă',
  expirata: 'Expirată',
  draft: 'Draft',
};

export async function PATCH(request: Request) {
  try {
    const auth = await requireApiAuth(request, { module: 'properties', action: 'edit' });
    if (!auth.ok) return auth.response;
    const { admin, user, agencyId } = auth.context;

    const { id, status } = await request.json();
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });
    if (!status || !VALID_STATUSES.includes(status)) {
      return Response.json({ error: 'Status invalid' }, { status: 400 });
    }

    const { data: property, error: findError } = await admin
      .from('properties')
      .select('id, status')
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (findError) return Response.json({ error: findError.message }, { status: 500 });
    if (!property) return Response.json({ error: 'Proprietatea nu există' }, { status: 404 });

    const { error } = await admin
      .from('properties')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null);
    if (error) return Response.json({ error: error.message }, { status: 500 });

    if (property.status !== status) {
      await logActivity({
        agency_id: agencyId,
        entity_type: 'property',
        entity_id: id,
        user_id: user.id,
        user_name: await getUserName(user.id),
        action: 'status',
        field: 'Status',
        old_value: STATUS_LABELS[property.status] || property.status,
        new_value: STATUS_LABELS[status] || status,
      });
    }

    return Response.json({ success: true, status });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Eroare internă' },
      { status: 500 },
    );
  }
}
