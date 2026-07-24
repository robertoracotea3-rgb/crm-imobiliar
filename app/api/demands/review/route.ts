export const dynamic = 'force-dynamic';

import {
  isDemandCloseReason,
  type DemandReviewAction,
} from '@/lib/demand-review';
import { appendAuditEvent } from '@/lib/server/audit-log';
import { requireApiAuth } from '@/lib/server/api-auth';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ACTIONS: DemandReviewAction[] = ['close', 'extend', 'activity', 'reopen'];

function parseBlockers(message: string): string[] {
  const marker = 'demand_review_blocked:';
  const start = message.indexOf(marker);
  if (start < 0) return [];
  try {
    const value = JSON.parse(message.slice(start + marker.length));
    return Array.isArray(value) ? value.map(String) : [];
  } catch {
    return [];
  }
}

function mapError(message: string) {
  const blockers = parseBlockers(message);
  if (blockers.length) {
    return {
      status: 409,
      body: { error: 'Cererea nu poate fi închisă.', blockers },
    };
  }
  if (
    message.includes('demand_review_actor_not_allowed')
    || message.includes('demand_review_actor_not_in_agency')
  ) {
    return { status: 403, body: { error: 'Cererea este alocată altui agent.' } };
  }
  if (
    message.includes('demand_not_waiting_for_review')
    || message.includes('demand_not_closed')
  ) {
    return { status: 409, body: { error: 'Acțiunea nu este permisă în starea actuală.' } };
  }
  if (
    message.includes('demand_future_next_action_required')
    || message.includes('demand_next_action_type_required')
  ) {
    return {
      status: 400,
      body: { error: 'Următoarea acțiune și data ei viitoare sunt obligatorii.' },
    };
  }
  if (
    message.includes('demand_close_reason_required')
    || message.includes('demand_close_note_required')
  ) {
    return { status: 400, body: { error: 'Selectează și explică motivul închiderii.' } };
  }
  if (
    message.includes('demand_activity_note_required')
    || message.includes('demand_reopen_note_required')
  ) {
    return { status: 400, body: { error: 'Descrierea activității este obligatorie.' } };
  }
  if (message.includes('demand_not_found')) {
    return { status: 404, body: { error: 'Cererea nu mai este disponibilă.' } };
  }
  return { status: 500, body: { error: 'Revizuirea cererii nu a putut fi salvată.' } };
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'demands', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin, agencyId, user, role } = auth.context;
  const body = await request.json().catch(() => ({}));
  const demandId = typeof body.demand_id === 'string' ? body.demand_id : '';
  const action = typeof body.action === 'string' ? body.action as DemandReviewAction : '';
  const reasonCode = typeof body.reason_code === 'string' ? body.reason_code : '';
  const note = typeof body.note === 'string' ? body.note.trim() : '';
  const nextActionType = typeof body.next_action_type === 'string'
    ? body.next_action_type.trim()
    : '';
  const nextActionAt = body.next_action_at ? new Date(body.next_action_at) : null;
  const idempotencyKey = typeof body.idempotency_key === 'string'
    ? body.idempotency_key.trim()
    : '';

  if (
    !UUID.test(demandId)
    || !ACTIONS.includes(action as DemandReviewAction)
    || !idempotencyKey
  ) {
    return Response.json({ error: 'Datele revizuirii sunt invalide.' }, { status: 400 });
  }
  if (action === 'close' && !isDemandCloseReason(reasonCode)) {
    return Response.json({ error: 'Selectează motivul închiderii.' }, { status: 400 });
  }
  if (action !== 'close' && (
    !nextActionAt
    || Number.isNaN(nextActionAt.getTime())
    || nextActionAt.getTime() <= Date.now()
    || !nextActionType
  )) {
    return Response.json({
      error: 'Următoarea acțiune și data ei viitoare sunt obligatorii.',
    }, { status: 400 });
  }

  const { data, error } = await serviceAdmin.rpc('crm_review_demand', {
    p_agency_id: agencyId,
    p_actor_id: user.id,
    p_demand_id: demandId,
    p_action: action,
    p_reason_code: action === 'close' ? reasonCode : null,
    p_note: note || null,
    p_next_action_type: action === 'close' ? null : nextActionType,
    p_next_action_at: action === 'close' ? null : nextActionAt?.toISOString(),
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    const mapped = mapError(error.message);
    return Response.json(mapped.body, { status: mapped.status });
  }

  await appendAuditEvent({
    client: serviceAdmin,
    request,
    agencyId,
    actorUserId: user.id,
    actorRole: role,
    action: `demand.review_${action}`,
    entityType: 'demand',
    entityId: demandId,
    before: { status: data?.from_status || null },
    after: { status: data?.status || null },
    reason: action === 'close' ? reasonCode : note || null,
    metadata: {
      next_action_type: action === 'close' ? null : nextActionType,
      next_action_at: action === 'close' ? null : nextActionAt?.toISOString(),
    },
  });

  return Response.json({ review: data });
}
