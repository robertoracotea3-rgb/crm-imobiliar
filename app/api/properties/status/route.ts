export const dynamic = 'force-dynamic';

import { getUserName, logActivity } from '@/lib/activity-log';
import {
  PROPERTY_STATUSES,
  PROPERTY_STATUS_TRANSITIONS,
  canTransition,
  getCatalogItem,
  isPropertyStatus,
} from '@/lib/crm-catalogs';
import { requireApiAuth } from '@/lib/server/api-auth';

const statusLabel = (code: string) => getCatalogItem(PROPERTY_STATUSES, code)?.label || code;

export async function PATCH(request: Request) {
  try {
    const auth = await requireApiAuth(request, { module: 'properties', action: 'edit' });
    if (!auth.ok) return auth.response;
    const { admin, user, agencyId } = auth.context;

    const { id, status, reason } = await request.json();
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });
    if (!isPropertyStatus(status)) {
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
    if (!isPropertyStatus(property.status) || !canTransition(PROPERTY_STATUS_TRANSITIONS, property.status, status)) {
      return Response.json({ error: `Tranziția ${statusLabel(property.status)} → ${statusLabel(status)} nu este permisă` }, { status: 409 });
    }

    const { error } = await admin
      .from('properties')
      .update({ status, status_reason: String(reason || '').trim() || null, updated_at: new Date().toISOString() })
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
        old_value: statusLabel(property.status),
        new_value: statusLabel(status),
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
