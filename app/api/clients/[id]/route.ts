export const dynamic = 'force-dynamic';

import { contextCanManageAll, requireApiAuth } from '@/lib/server/api-auth';
import { appendAuditEvent } from '@/lib/server/audit-log';
import { buildPublicPropertyUrl } from '@/lib/public-property-url';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type TimelineItem = {
  id: string;
  kind: string;
  title: string;
  description: string | null;
  occurred_at: string;
  entity_id: string;
};

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireApiAuth(request, { module: 'contacts', action: 'view' });
  if (!auth.ok) return auth.response;
  const { admin, serviceAdmin, agencyId, user, role } = auth.context;
  const { id } = await params;
  if (!UUID.test(id)) return Response.json({ error: 'ID client invalid' }, { status: 400 });

  const { data: contact, error: contactError } = await admin
    .from('contacts')
    .select('id, full_name, phone, phone_secondary, email, cnp, address, type, notes, source, agent_id, gdpr_consent, gdpr_consent_at, merge_status, merged_into_id, lifecycle_status, lifecycle_changed_at, lifecycle_reason, last_relevant_activity_at, old_since_at, archived_at, archived_by, archive_reason, reactivated_at, created_at, updated_at')
    .eq('id', id)
    .eq('agency_id', agencyId)
    .is('deleted_at', null)
    .maybeSingle();
  if (contactError) return Response.json({ error: 'Profilul clientului nu a putut fi încărcat' }, { status: 500 });
  if (!contact) return Response.json({ error: 'Clientul nu există sau nu este accesibil' }, { status: 404 });

  const [leadResult, demandResult, activityResult, viewingResult, transactionResult, ownedPropertyResult, identifierResult, sourceResult, agentResult, lifecycleResult] = await Promise.all([
    admin.from('leads').select('*').eq('agency_id', agencyId).or(`contact_id.eq.${id},converted_contact_id.eq.${id}`).is('deleted_at', null).order('received_at', { ascending: false }),
    admin.from('demands').select('*').eq('agency_id', agencyId).eq('contact_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
    admin.from('activities').select('*').eq('agency_id', agencyId).eq('contact_id', id).order('created_at', { ascending: false }).limit(500),
    admin.from('calendar_events').select('*').eq('agency_id', agencyId).eq('contact_id', id).is('deleted_at', null).order('start_at', { ascending: false }),
    admin.from('transactions').select('*').eq('agency_id', agencyId).eq('contact_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
    admin.from('properties').select('id, internal_code, title, city, category, status, agent_id, attributes').eq('agency_id', agencyId).eq('owner_contact_id', id).is('deleted_at', null).order('created_at', { ascending: false }),
    admin.from('client_identifiers').select('id, identifier_type, normalized_value, portal, is_active, first_seen_at, last_seen_at').eq('agency_id', agencyId).eq('contact_id', id).order('first_seen_at'),
    admin.from('client_contact_sources').select('source_code, first_seen_at, last_seen_at').eq('agency_id', agencyId).eq('contact_id', id).order('first_seen_at'),
    admin.from('client_contact_agents').select('agent_id, relationship_reason, active, first_seen_at, last_seen_at').eq('agency_id', agencyId).eq('contact_id', id).order('first_seen_at'),
    admin.from('contact_lifecycle_events').select('id, from_status, to_status, reason, source, actor_id, metadata, created_at').eq('agency_id', agencyId).eq('contact_id', id).order('created_at', { ascending: false }),
  ]);

  const leads = leadResult.data || [];
  const leadIds = leads.map((lead) => lead.id);
  const relatedPropertyIds = [...new Set([
    ...leads.map((lead) => lead.property_id),
    ...(viewingResult.data || []).map((viewing) => viewing.property_id),
  ].filter(Boolean))] as string[];

  const [taskResult, relatedPropertyResult] = await Promise.all([
    leadIds.length
      ? admin.from('tasks').select('*').eq('agency_id', agencyId).in('lead_id', leadIds).order('created_at', { ascending: false })
      : Promise.resolve({ data: [], error: null }),
    relatedPropertyIds.length
      ? admin.from('properties').select('id, internal_code, title, city, category, status, attributes').eq('agency_id', agencyId).in('id', relatedPropertyIds).is('deleted_at', null)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const propertyMap = Object.fromEntries((relatedPropertyResult.data || []).map((property) => [property.id, {
    ...property,
    public_url: buildPublicPropertyUrl(property),
  }]));
  const enrichedLeads = leads.map((lead) => ({
    ...lead,
    property: lead.property_id ? propertyMap[lead.property_id] || null : null,
  }));
  const enrichedViewings = (viewingResult.data || []).map((viewing) => ({
    ...viewing,
    property: viewing.property_id ? propertyMap[viewing.property_id] || null : null,
  }));
  const documentPropertyIds = [...new Set([
    ...relatedPropertyIds,
    ...(ownedPropertyResult.data || []).map((property) => property.id),
  ])];
  const { data: documents } = documentPropertyIds.length
    ? await admin.from('property_documents')
      .select('id, property_id, category, file_name, mime_type, size, created_at')
      .eq('agency_id', agencyId)
      .in('property_id', documentPropertyIds)
      .order('created_at', { ascending: false })
    : { data: [] };

  const timeline: TimelineItem[] = [
    ...enrichedLeads.map((lead) => ({
      id: `lead:${lead.id}`, kind: 'lead', title: 'Lead primit',
      description: lead.message || null, occurred_at: lead.received_at, entity_id: lead.id,
    })),
    ...(demandResult.data || []).map((demand) => ({
      id: `demand:${demand.id}`, kind: 'demand', title: `Cerere ${demand.internal_code || ''}`.trim(),
      description: demand.notes || null, occurred_at: demand.created_at, entity_id: demand.id,
    })),
    ...(activityResult.data || []).map((activity) => ({
      id: `activity:${activity.id}`, kind: 'activity', title: activity.title || activity.type || 'Activitate',
      description: activity.description || activity.notes || null, occurred_at: activity.created_at, entity_id: activity.id,
    })),
    ...enrichedViewings.map((viewing) => ({
      id: `viewing:${viewing.id}`, kind: 'viewing', title: viewing.title || 'Vizionare',
      description: viewing.outcome || viewing.description || null, occurred_at: viewing.start_at, entity_id: viewing.id,
    })),
    ...(transactionResult.data || []).map((transaction) => ({
      id: `transaction:${transaction.id}`, kind: 'transaction', title: 'Tranzacție',
      description: transaction.notes || null, occurred_at: transaction.closed_at || transaction.created_at, entity_id: transaction.id,
    })),
    ...(taskResult.data || []).map((task) => ({
      id: `task:${task.id}`, kind: 'task', title: task.title || 'Task',
      description: task.description || null, occurred_at: task.completed_at || task.created_at, entity_id: task.id,
    })),
    ...(documents || []).map((document) => ({
      id: `document:${document.id}`, kind: 'document', title: `Document: ${document.file_name}`,
      description: document.category || null, occurred_at: document.created_at, entity_id: document.id,
    })),
    ...(lifecycleResult.data || []).map((event) => ({
      id: `lifecycle:${event.id}`,
      kind: 'lifecycle',
      title: `Stare client: ${event.from_status || 'profil creat'} → ${event.to_status}`,
      description: event.reason || null,
      occurred_at: event.created_at,
      entity_id: event.id,
    })),
  ].filter((item) => item.occurred_at).sort((left, right) => (
    new Date(right.occurred_at).getTime() - new Date(left.occurred_at).getTime()
  ));

  const ownedProperties = (ownedPropertyResult.data || []).map((property) => ({
    ...property,
    public_url: buildPublicPropertyUrl(property),
  }));

  await appendAuditEvent({
    client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: role,
    action: 'contact.sensitive_profile_accessed', entityType: 'contact', entityId: contact.id,
    metadata: {
      fields: ['phone', 'email', 'cnp', 'address', 'gdpr_consent', 'documents', 'transactions'],
      related_records: timeline.length,
    },
  });

  return Response.json({
    contact,
    identifiers: identifierResult.data || [],
    sources: sourceResult.data || [],
    agents: agentResult.data || [],
    lifecycle_history: lifecycleResult.data || [],
    leads: enrichedLeads,
    demands: demandResult.data || [],
    activities: activityResult.data || [],
    viewings: enrichedViewings,
    tasks: taskResult.data || [],
    transactions: transactionResult.data || [],
    documents: documents || [],
    owned_properties: ownedProperties,
    timeline,
    summary: {
      leads: enrichedLeads.length,
      demands: (demandResult.data || []).length,
      viewings: enrichedViewings.length,
      tasks: (taskResult.data || []).length,
      transactions: (transactionResult.data || []).length,
      owned_properties: ownedProperties.length,
      documents: (documents || []).length,
    },
    capabilities: {
      can_manage_duplicates: contextCanManageAll(auth.context, 'contacts'),
      can_archive: ['owner', 'admin', 'manager'].includes(role),
    },
  });
}
