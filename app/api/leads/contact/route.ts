export const dynamic = 'force-dynamic';

import { appendAuditEvent } from '@/lib/server/audit-log';
import { requireApiAuth } from '@/lib/server/api-auth';

const CHANNELS = ['phone', 'whatsapp', 'email', 'in_person'];
const OUTCOMES = [
  'connected_interested',
  'connected_followup',
  'connected_not_interested',
  'no_answer',
  'unreachable',
  'wrong_number',
  'message_sent_waiting_reply',
];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const optionalNumber = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
};

function contactError(message: string): { status: number; error: string } {
  if (message.includes('contact_description_required')) {
    return { status: 400, error: 'Descrierea conversației este obligatorie.' };
  }
  if (message.includes('client_need_required_for_successful_contact')) {
    return { status: 400, error: 'Completează ce dorește clientul.' };
  }
  if (message.includes('future_next_action_required')) {
    return { status: 400, error: 'Următoarea acțiune și data ei viitoare sunt obligatorii.' };
  }
  if (message.includes('contact_actor_not_allowed')) {
    return { status: 403, error: 'Leadul este alocat altui agent.' };
  }
  if (message.includes('contact_property_outside_agency_or_missing')) {
    return { status: 400, error: 'Proprietatea discutată nu aparține agenției.' };
  }
  if (message.includes('lead_not_found')) {
    return { status: 404, error: 'Leadul nu mai este disponibil.' };
  }
  if (message.includes('invalid_contact_budget')) {
    return { status: 400, error: 'Bugetul introdus nu este valid.' };
  }
  return { status: 500, error: 'Interacțiunea nu a putut fi salvată.' };
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'leads', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { admin, serviceAdmin, agencyId, user, role } = auth.context;
  const body = await request.json().catch(() => ({}));

  const leadId = typeof body.lead_id === 'string' ? body.lead_id : '';
  const propertyId = typeof body.property_id === 'string' && body.property_id
    ? body.property_id
    : null;
  const channel = typeof body.channel === 'string' ? body.channel : '';
  const outcome = typeof body.outcome === 'string' ? body.outcome : '';
  const description = typeof body.description === 'string' ? body.description.trim() : '';
  const clientNeed = typeof body.client_need === 'string' ? body.client_need.trim() : '';
  const nextActionType = typeof body.next_action_type === 'string'
    ? body.next_action_type.trim()
    : '';
  const nextActionAt = body.next_action_at ? new Date(body.next_action_at) : null;
  const occurredAt = body.occurred_at ? new Date(body.occurred_at) : new Date();
  const idempotencyKey = typeof body.idempotency_key === 'string'
    ? body.idempotency_key.trim()
    : '';

  if (!UUID.test(leadId)
    || (propertyId && !UUID.test(propertyId))
    || !CHANNELS.includes(channel)
    || !OUTCOMES.includes(outcome)
    || !idempotencyKey) {
    return Response.json({ error: 'Datele interacțiunii sunt invalide.' }, { status: 400 });
  }
  if (!description || description.length < 5) {
    return Response.json({ error: 'Descrierea conversației este obligatorie.' }, { status: 400 });
  }
  if (!nextActionAt || Number.isNaN(nextActionAt.getTime()) || nextActionAt.getTime() <= Date.now()) {
    return Response.json({ error: 'Data următoarei acțiuni trebuie să fie în viitor.' }, { status: 400 });
  }
  if (Number.isNaN(occurredAt.getTime()) || occurredAt.getTime() > Date.now() + 5 * 60_000) {
    return Response.json({ error: 'Data interacțiunii este invalidă.' }, { status: 400 });
  }

  const { data: lead } = await admin
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .eq('agency_id', agencyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (!lead) return Response.json({ error: 'Leadul nu a fost găsit.' }, { status: 404 });

  const { data, error } = await serviceAdmin.rpc('crm_record_lead_contact', {
    p_agency_id: agencyId,
    p_actor_id: user.id,
    p_lead_id: leadId,
    p_channel: channel,
    p_outcome: outcome,
    p_description: description,
    p_client_need: clientNeed || null,
    p_property_id: propertyId,
    p_budget_min: optionalNumber(body.budget_min),
    p_budget_max: optionalNumber(body.budget_max),
    p_currency: typeof body.currency === 'string' ? body.currency : null,
    p_city: typeof body.city === 'string' ? body.city.trim() || null : null,
    p_zone: typeof body.zone === 'string' ? body.zone.trim() || null : null,
    p_next_action_type: nextActionType,
    p_next_action_at: nextActionAt.toISOString(),
    p_occurred_at: occurredAt.toISOString(),
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    const mapped = contactError(error.message);
    return Response.json({ error: mapped.error }, { status: mapped.status });
  }

  await appendAuditEvent({
    client: serviceAdmin,
    request,
    agencyId,
    actorUserId: user.id,
    actorRole: role,
    action: 'lead.contact_interaction_recorded',
    entityType: 'lead',
    entityId: leadId,
    metadata: {
      channel,
      outcome,
      successful_contact: data?.successful_contact === true,
      interaction_id: data?.interaction_id || null,
    },
  });

  return Response.json({ interaction: data }, { status: data?.duplicate ? 200 : 201 });
}
