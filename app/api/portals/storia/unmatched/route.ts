export const dynamic = 'force-dynamic';

import { contextCanManageAll, requireApiAuth } from '@/lib/server/api-auth';
import {
  linkQueuedStoriaMessage,
  type IncomingStoriaLead,
} from '@/lib/server/storia-leads';
import { STORIA_CRM_PORTAL_ID } from '@/lib/server/storia-ad-identity.mjs';

type QueueRow = {
  id: string;
  webhook_event_id: string;
  portal: string;
  portal_ad_id: string | null;
  external_id: string | null;
  conversation_id: string | null;
  sender_name: string | null;
  sender_email: string | null;
  sender_phone: string | null;
  message: string | null;
  property_title_hint: string | null;
  advert_url_hint: string | null;
  reason: string;
  created_at: string;
};

const queueToLeadInput = (row: QueueRow): IncomingStoriaLead => ({
  ad_id: row.portal_ad_id || undefined,
  external_id: row.external_id || undefined,
  ad_url: row.advert_url_hint || undefined,
  property_title: row.property_title_hint || undefined,
  conversation_id: row.conversation_id || undefined,
  sender_name: row.sender_name || undefined,
  sender_email: row.sender_email || undefined,
  sender_phone: row.sender_phone || undefined,
  message: row.message || undefined,
  from: row.portal,
});

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'leads', action: 'view' });
  if (!auth.ok) return auth.response;
  const { admin, serviceAdmin, agencyId } = auth.context;
  const canManageAllLeads = contextCanManageAll(auth.context, 'leads');

  // Mesajele din coada tehnică nu au încă un agent. Pot conține date personale
  // destinate altui agent, deci sunt vizibile numai rolurilor cu manage_all.
  const queueResult = canManageAllLeads
    ? await serviceAdmin
      .from('portal_unmatched_messages')
      .select('id, webhook_event_id, portal, portal_ad_id, external_id, conversation_id, sender_name, sender_email, sender_phone, message, property_title_hint, advert_url_hint, reason, created_at')
      .eq('agency_id', agencyId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(200)
    : { data: [] as QueueRow[], error: null };

  const legacyResult = await admin
    .from('leads')
    .select('id, contact_name, contact_email, contact_phone, message, source, portal_ad_id, received_at')
    .eq('agency_id', agencyId)
    .is('property_id', null)
    .is('deleted_at', null)
    .eq('association_status', 'pending')
    .in('source_normalized', ['storia', 'olx', 'storia_olx'])
    .order('received_at', { ascending: false })
    .limit(200);

  if (queueResult.error) {
    return Response.json({ error: 'Nu am putut încărca mesajele neasociate' }, { status: 500 });
  }
  if (legacyResult.error) {
    return Response.json({ error: 'Nu am putut încărca leadurile istorice neasociate' }, { status: 500 });
  }

  const messages = [
    ...(queueResult.data || []).map((row) => ({
      id: `queue:${row.id}`,
      kind: 'queue',
      source: row.portal === 'storia' ? 'Storia' : row.portal,
      received_at: row.created_at,
      client_name: row.sender_name,
      client_email: row.sender_email,
      client_phone: row.sender_phone,
      message: row.message,
      portal_ad_id: row.portal_ad_id,
      property_title_hint: row.property_title_hint,
      reason: row.reason,
    })),
    ...(legacyResult.data || []).map((row) => ({
      id: `lead:${row.id}`,
      kind: 'legacy_lead',
      source: row.source || 'Storia',
      received_at: row.received_at,
      client_name: row.contact_name,
      client_email: row.contact_email,
      client_phone: row.contact_phone,
      message: row.message,
      portal_ad_id: row.portal_ad_id,
      property_title_hint: null,
      reason: 'historical_lead_without_advert_identity',
    })),
  ].sort((a, b) => String(b.received_at).localeCompare(String(a.received_at)));

  return Response.json({ messages, count: messages.length });
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'leads', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { admin, serviceAdmin, agencyId, user } = auth.context;
  const body = await request.json().catch(() => ({}));
  const compoundId = typeof body.id === 'string' ? body.id : '';
  const action = body.action;
  const [kind, id] = compoundId.split(':', 2);

  if (!id || !['queue', 'lead'].includes(kind)) {
    return Response.json({ error: 'Mesaj neasociat invalid' }, { status: 400 });
  }
  if (!['link', 'ignore'].includes(action)) {
    return Response.json({ error: 'Acțiune invalidă' }, { status: 400 });
  }
  if (action === 'ignore' && !String(body.reason || '').trim()) {
    return Response.json({ error: 'Motivul ignorării este obligatoriu' }, { status: 400 });
  }

  if (kind === 'lead') {
    const { data: lead, error: leadError } = await admin
      .from('leads')
      .select('id')
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('property_id', null)
      .is('deleted_at', null)
      .eq('association_status', 'pending')
      .in('source_normalized', ['storia', 'olx', 'storia_olx'])
      .maybeSingle();
    if (leadError || !lead) return Response.json({ error: 'Leadul nu mai este disponibil' }, { status: 404 });

    if (action === 'ignore') {
      const { error } = await admin.from('leads').update({
        association_status: 'ignored',
        association_note: String(body.reason).trim(),
        association_resolved_at: new Date().toISOString(),
        association_resolved_by: user.id,
      }).eq('id', id).eq('agency_id', agencyId);
      if (error) return Response.json({ error: 'Ignorarea nu a putut fi salvată' }, { status: 500 });
      return Response.json({ success: true });
    }

    const propertyId = typeof body.property_id === 'string' ? body.property_id : '';
    const { data: property, error: propertyError } = await admin
      .from('properties')
      .select('id, title, agent_id, city, county, category')
      .eq('id', propertyId)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (propertyError || !property) {
      return Response.json({ error: 'Proprietatea nu aparține agenției' }, { status: 404 });
    }
    const { data: listing, error: listingError } = await admin
      .from('portal_listings')
      .select('id, portal_ad_id')
      .eq('agency_id', agencyId)
      .eq('property_id', propertyId)
      .eq('portal', 'storia')
      .maybeSingle();
    if (listingError) return Response.json({ error: 'Anunțul Storia este ambiguu' }, { status: 409 });

    const { error } = await admin.from('leads').update({
      property_id: property.id,
      property_title: property.title,
      agent_id: property.agent_id,
      city: property.city,
      county: property.county,
      category: property.category,
      portal_id: STORIA_CRM_PORTAL_ID,
      portal_listing_id: listing?.id || null,
      portal_ad_id: listing?.portal_ad_id || null,
      association_status: 'linked',
      association_note: 'Asociere manuală',
      association_resolved_at: new Date().toISOString(),
      association_resolved_by: user.id,
    }).eq('id', id).eq('agency_id', agencyId);
    if (error) return Response.json({ error: 'Asocierea nu a putut fi salvată' }, { status: 500 });

    await admin.from('activities').insert({
      agency_id: agencyId,
      user_id: user.id,
      type: 'association',
      title: 'Proprietate asociată manual',
      lead_id: id,
      property_id: property.id,
    });
    return Response.json({ success: true, lead_id: id });
  }

  // O intrare neasociată nu are încă proprietar/agent; numai managerii întregii
  // agenții o pot vedea și rezolva fără să expunem date între agenți.
  if (!contextCanManageAll(auth.context, 'leads')) {
    return Response.json({ error: 'Acces interzis' }, { status: 403 });
  }

  const { data: queued, error: queueError } = await serviceAdmin
    .from('portal_unmatched_messages')
    .select('id, webhook_event_id, portal, portal_ad_id, external_id, conversation_id, sender_name, sender_email, sender_phone, message, property_title_hint, advert_url_hint, reason, created_at')
    .eq('id', id)
    .eq('agency_id', agencyId)
    .eq('status', 'pending')
    .maybeSingle();
  if (queueError || !queued) {
    return Response.json({ error: 'Mesajul nu mai este disponibil' }, { status: 404 });
  }

  if (action === 'ignore') {
    const { error } = await serviceAdmin.from('portal_unmatched_messages').update({
      status: 'ignored',
      resolution_note: String(body.reason).trim(),
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('agency_id', agencyId);
    if (error) return Response.json({ error: 'Ignorarea nu a putut fi salvată' }, { status: 500 });
    return Response.json({ success: true });
  }

  const propertyId = typeof body.property_id === 'string' ? body.property_id : '';
  if (!propertyId) return Response.json({ error: 'Proprietatea este obligatorie' }, { status: 400 });
  const { data: event, error: eventError } = await serviceAdmin
    .from('webhook_events')
    .select('transaction_id')
    .eq('id', queued.webhook_event_id)
    .eq('agency_id', agencyId)
    .eq('signature_verified', true)
    .maybeSingle();
  if (eventError || !event?.transaction_id) {
    return Response.json({ error: 'Evenimentul verificat nu a fost găsit' }, { status: 409 });
  }

  try {
    const result = await linkQueuedStoriaMessage(
      admin,
      queueToLeadInput(queued as QueueRow),
      propertyId,
      event.transaction_id as string,
      agencyId,
    );
    const { error } = await serviceAdmin.from('portal_unmatched_messages').update({
      status: 'linked',
      linked_lead_id: result.leadId,
      linked_property_id: propertyId,
      resolution_note: 'Asociere manuală',
      resolved_by: user.id,
      resolved_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('agency_id', agencyId);
    if (error) throw new Error('Queue resolution update failed');
    return Response.json({ success: true, lead_id: result.leadId });
  } catch {
    return Response.json({ error: 'Asocierea mesajului nu a putut fi finalizată' }, { status: 500 });
  }
}
