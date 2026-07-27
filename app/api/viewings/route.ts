export const dynamic = 'force-dynamic';

import { contextHasPermission, requireApiAuth } from '@/lib/server/api-auth';
import { normalizeViewingRequest } from '@/lib/viewings';

const TRANSITIONS = ['confirm', 'reschedule', 'cancel', 'complete'] as const;
type ViewingTransition = typeof TRANSITIONS[number];

const friendlyError = (message: string) => {
  if (message.includes('viewing_start_invalid')) return 'Data și ora sunt obligatorii';
  if (message.includes('viewing_must_be_future')) return 'Vizionarea trebuie programată în viitor';
  if (message.includes('invalid_duration')) return 'Durata trebuie să fie între 15 minute și 8 ore';
  if (message.includes('reminder_invalid')) return 'Reminder invalid';
  if (message.includes('reminder_must_precede_viewing')) return 'Reminderul trebuie să fie înaintea vizionării';
  if (message.includes('participants_invalid')) return 'Lista participanților este invalidă';
  if (message.includes('property_not_found')) return 'Proprietatea nu aparține agenției';
  if (message.includes('lead_not_found') || message.includes('contact_not_found')) return 'Clientul nu aparține agenției';
  if (message.includes('agent_not_found')) return 'Agentul nu aparține agenției';
  if (message.includes('client_required')) return 'Selectează un lead sau un contact';
  if (message.includes('cancellation_reason_required')) return 'Motivul anulării este obligatoriu';
  if (message.includes('reschedule_reason_required')) return 'Motivul reprogramării este obligatoriu';
  if (message.includes('outcome_required')) return 'Rezultatul vizionării este obligatoriu';
  if (message.includes('viewing_not_found')) return 'Vizionarea nu a fost găsită';
  if (message.includes('invalid_viewing_transition')) return 'Tranziția nu este permisă din starea curentă';
  if (message.includes('crm_status_transition_invalid:lead')) {
    return 'Statusul actual al clientului nu permite programarea vizionării';
  }
  return 'Vizionarea nu a putut fi salvată';
};

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'viewings', action: 'view' });
  if (!auth.ok) return auth.response;
  const { admin, agencyId } = auth.context;

  const { data, error } = await admin
    .from('calendar_events')
    .select('*')
    .eq('agency_id', agencyId)
    .eq('type', 'vizionare')
    .is('deleted_at', null)
    .order('start_at', { ascending: false })
    .limit(300);
  if (error) return Response.json({ error: 'Vizionările nu au putut fi încărcate' }, { status: 500 });

  const rows = data || [];
  const propertyIds = [...new Set(rows.map((row) => row.property_id).filter(Boolean))] as string[];
  const propertyMap = new Map<string, { title: string | null; internal_code: string | null }>();
  if (propertyIds.length) {
    const { data: properties } = await admin
      .from('properties')
      .select('id, title, internal_code')
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .in('id', propertyIds);
    for (const property of properties || []) propertyMap.set(property.id, property);
  }

  return Response.json({
    viewings: rows.map((row) => ({
      ...row,
      property_title: propertyMap.get(row.property_id)?.title || null,
      property_code: propertyMap.get(row.property_id)?.internal_code || null,
    })),
  });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'viewings', action: 'create' });
  if (!auth.ok) return auth.response;
  const { admin, serviceAdmin, agencyId, user } = auth.context;
  const body = await request.json().catch(() => ({}));
  let normalized;
  try {
    normalized = normalizeViewingRequest(body);
  } catch (error) {
    return Response.json({
      error: friendlyError(error instanceof Error ? error.message : ''),
    }, { status: 400 });
  }

  const { data: property } = await admin
    .from('properties')
    .select('id, agent_id')
    .eq('id', normalized.propertyId)
    .eq('agency_id', agencyId)
    .maybeSingle();
  if (!property) return Response.json({ error: 'Proprietatea nu este accesibilă' }, { status: 404 });

  const { data: contact } = await admin
    .from('contacts')
    .select('id')
    .eq('id', normalized.contactId)
    .eq('agency_id', agencyId)
    .maybeSingle();
  if (!contact) return Response.json({ error: 'Clientul nu este accesibil' }, { status: 404 });

  if (normalized.leadId) {
    const { data: lead } = await admin
      .from('leads')
      .select('id')
      .eq('id', normalized.leadId)
      .eq('agency_id', agencyId)
      .maybeSingle();
    if (!lead) return Response.json({ error: 'Leadul nu este accesibil' }, { status: 404 });
  }

  const requestedAgent = normalized.agentId || property.agent_id || user.id;
  if (requestedAgent !== user.id && !contextHasPermission(auth.context, 'viewings', 'assign')) {
    return Response.json({ error: 'Nu poți programa vizionarea pentru alt agent' }, { status: 403 });
  }

  const { data: viewingId, error } = await serviceAdmin.rpc('create_crm_viewing', {
    p_agency_id: agencyId,
    p_user_id: user.id,
    p_lead_id: normalized.leadId,
    p_contact_id: normalized.contactId,
    p_property_id: normalized.propertyId,
    p_agent_id: requestedAgent,
    p_start_at: normalized.startAt,
    p_duration_minutes: normalized.durationMinutes,
    p_location: normalized.location,
    p_description: normalized.description,
    p_participants: normalized.participants,
    p_reminder_at: normalized.reminderAt,
  });
  if (error) return Response.json({ error: friendlyError(error.message) }, { status: 400 });

  const { data: viewing } = await admin
    .from('calendar_events')
    .select('*')
    .eq('id', viewingId)
    .eq('agency_id', agencyId)
    .single();
  return Response.json({ viewing }, { status: 201 });
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'viewings', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { admin, serviceAdmin, agencyId, user } = auth.context;
  const body = await request.json().catch(() => ({}));
  const action = body.action as ViewingTransition;
  if (!body.id || !TRANSITIONS.includes(action)) {
    return Response.json({ error: 'Tranziție de vizionare invalidă' }, { status: 400 });
  }


  const { data: accessibleViewing } = await admin
    .from('calendar_events')
    .select('id')
    .eq('id', body.id)
    .eq('agency_id', agencyId)
    .maybeSingle();
  if (!accessibleViewing) return Response.json({ error: 'Vizionarea nu este accesibilă' }, { status: 404 });

  const startAt = body.start_at ? new Date(body.start_at) : null;
  const nextActionAt = body.next_action_at ? new Date(body.next_action_at) : null;
  const { data, error } = await serviceAdmin.rpc('transition_crm_viewing', {
    p_agency_id: agencyId,
    p_user_id: user.id,
    p_viewing_id: body.id,
    p_action: action,
    p_start_at: startAt && !Number.isNaN(startAt.getTime()) ? startAt.toISOString() : null,
    p_duration_minutes: body.duration_minutes ? Number(body.duration_minutes) : null,
    p_reason: body.reason || null,
    p_outcome: body.outcome || null,
    p_client_feedback: body.client_feedback || null,
    p_owner_feedback: body.owner_feedback || null,
    p_next_action_at: nextActionAt && !Number.isNaN(nextActionAt.getTime()) ? nextActionAt.toISOString() : null,
  });
  if (error) return Response.json({ error: friendlyError(error.message) }, { status: 400 });
  return Response.json(data);
}

export async function DELETE(request: Request) {
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const reason = url.searchParams.get('reason');
  const syntheticRequest = new Request(request.url, {
    method: 'PATCH',
    headers: request.headers,
    body: JSON.stringify({ id, action: 'cancel', reason }),
  });
  return PATCH(syntheticRequest);
}
