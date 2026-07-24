export const dynamic = 'force-dynamic';

import { normalizeLeadSource } from '@/lib/crm-catalogs';
import { appendAuditEvent } from '@/lib/server/audit-log';
import { contextHasPermission, requireApiAuth } from '@/lib/server/api-auth';

function errMsg(err: unknown): string {
  if (!err) return 'Eroare';
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    return String(o.message || o.details || JSON.stringify(err));
  }
  return String(err);
}

// Schema reala DB: full_name, phone, phone_secondary, email, type (text[]), cnp, address, notes
// UI foloseste: name, phone, phone2, email, cnp, address, type (string), notes
interface DbContact {
  id: string;
  full_name: string;
  phone: string | null;
  phone_secondary: string | null;
  email: string | null;
  cnp: string | null;
  address: string | null;
  type: string[] | null;
  notes: string | null;
  agent_id: string | null;
  source: string | null;
  gdpr_consent: boolean | null;
  gdpr_consent_at: string | null;
  merge_status: string;
  lifecycle_status: string;
  lifecycle_changed_at: string;
  lifecycle_reason: string | null;
  last_relevant_activity_at: string | null;
  archived_at: string | null;
  archive_reason: string | null;
  reactivated_at: string | null;
  created_at: string;
}

function toUi(c: DbContact) {
  return {
    id: c.id,
    name: c.full_name,
    phone: c.phone || '',
    phone2: c.phone_secondary || '',
    email: c.email || '',
    cnp: c.cnp || '',
    address: c.address || '',
    type: c.type?.[0] || 'proprietar',
    notes: c.notes || '',
    agent_id: c.agent_id || '',
    source: c.source || '',
    gdpr_consent: Boolean(c.gdpr_consent),
    gdpr_consent_at: c.gdpr_consent_at,
    merge_status: c.merge_status,
    lifecycle_status: c.lifecycle_status,
    lifecycle_changed_at: c.lifecycle_changed_at,
    lifecycle_reason: c.lifecycle_reason,
    last_relevant_activity_at: c.last_relevant_activity_at,
    archived_at: c.archived_at,
    archive_reason: c.archive_reason,
    reactivated_at: c.reactivated_at,
    created_at: c.created_at,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await requireApiAuth(request, { module: 'contacts', action: 'view' });
    if (!auth.ok) return auth.response;
    const { admin, serviceAdmin, agencyId, user, role } = auth.context;
    const { data, error } = await admin
      .from('contacts')
      .select('id, full_name, phone, phone_secondary, email, cnp, address, type, notes, agent_id, source, gdpr_consent, gdpr_consent_at, merge_status, lifecycle_status, lifecycle_changed_at, lifecycle_reason, last_relevant_activity_at, archived_at, archive_reason, reactivated_at, created_at')
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .eq('merge_status', 'active')
      .order('full_name')
      .limit(500);
    if (error) return Response.json({ error: errMsg(error), contacts: [] });
    await appendAuditEvent({
      client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: role,
      action: 'contact.sensitive_list_accessed', entityType: 'contact',
      metadata: { record_count: data?.length || 0, fields: ['phone', 'email', 'cnp', 'address'] },
    });
    return Response.json({ contacts: (data as DbContact[]).map(toUi) });
  } catch (err) {
    return Response.json({ error: errMsg(err), contacts: [] });
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireApiAuth(request, { module: 'contacts', action: 'create' });
    if (!auth.ok) return auth.response;
    const { admin, serviceAdmin, user, agencyId } = auth.context;
    const body = await request.json();
    const { name, phone, phone2, email, cnp, address, type, notes, agent_id, source } = body;
    if (!name?.trim()) return Response.json({ error: 'Numele este obligatoriu' }, { status: 400 });
    const assignedAgent = agent_id || user.id;
    if (assignedAgent !== user.id && !contextHasPermission(auth.context, 'contacts', 'assign')) {
      return Response.json({ error: 'Nu poți atribui clientul altui agent' }, { status: 403 });
    }
    const normalizedSource = normalizeLeadSource(source) || 'manual';
    const { data: resolution, error: resolutionError } = await serviceAdmin.rpc('resolve_crm_contact', {
      p_agency_id: agencyId,
      p_actor_id: user.id,
      p_name: name.trim(),
      p_phone: phone?.trim() || null,
      p_email: email?.trim() || null,
      p_agent_id: assignedAgent,
      p_source: normalizedSource,
      p_portal: null,
      p_portal_client_id: null,
    });
    if (resolutionError) return Response.json({ error: 'Profilul clientului nu a putut fi creat' }, { status: 500 });
    if (!resolution?.contact_id) {
      return Response.json({
        error: 'Există mai multe contacte cu această identitate. Verifică secțiunea Duplicate.',
        duplicateReviewRequired: true,
      }, { status: 409 });
    }

    const wasCreated = resolution.status === 'created';
    if (wasCreated) {
      const { error: detailsError } = await admin.from('contacts').update({
        phone_secondary: phone2?.trim() || null,
        cnp: cnp?.trim() || null,
        address: address?.trim() || null,
        type: [type || 'proprietar'],
        notes: notes?.trim() || null,
      }).eq('id', resolution.contact_id).eq('agency_id', agencyId);
      if (detailsError) return Response.json({ error: errMsg(detailsError) }, { status: 500 });
    }

    const { data: contact, error } = await admin.from('contacts')
      .select('id, full_name, phone, phone_secondary, email, cnp, address, type, notes, agent_id, source, gdpr_consent, gdpr_consent_at, merge_status, lifecycle_status, lifecycle_changed_at, lifecycle_reason, last_relevant_activity_at, archived_at, archive_reason, reactivated_at, created_at')
      .eq('id', resolution.contact_id)
      .eq('agency_id', agencyId)
      .eq('merge_status', 'active')
      .single();
    if (error) return Response.json({ error: errMsg(error) }, { status: 500 });
    return Response.json({ contact: toUi(contact as DbContact), deduped: !wasCreated }, { status: wasCreated ? 201 : 200 });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireApiAuth(request, { module: 'contacts', action: 'edit' });
    if (!auth.ok) return auth.response;
    const { admin, serviceAdmin, user, agencyId, role } = auth.context;
    const body = await request.json();
    const { id, name, phone, phone2, email, cnp, address, type, notes, agent_id } = body;
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });
    if (!name?.trim()) return Response.json({ error: 'Numele este obligatoriu' }, { status: 400 });

    if (agent_id && agent_id !== user.id && !contextHasPermission(auth.context, 'contacts', 'assign')) {
      return Response.json({ error: 'Nu poți atribui clientul altui agent' }, { status: 403 });
    }

    const { data: existing } = await admin.from('contacts')
      .select('id,agent_id')
      .eq('id', id)
      .eq('agency_id', agencyId)
      .eq('merge_status', 'active')
      .is('deleted_at', null)
      .maybeSingle();
    if (!existing) return Response.json({ error: 'Clientul nu există' }, { status: 404 });

    const { data: contact, error } = await admin.from('contacts').update({
      full_name: name.trim(),
      phone: phone?.trim() || null,
      phone_secondary: phone2?.trim() || null,
      email: email?.trim() || null,
      cnp: cnp?.trim() || null,
      address: address?.trim() || null,
      type: [type || 'proprietar'],
      notes: notes?.trim() || null,
      ...(agent_id !== undefined ? { agent_id: agent_id || null } : {}),
    })
      .eq('id', id)
      .eq('agency_id', agencyId)
      .eq('merge_status', 'active')
      .is('deleted_at', null)
      .select('id, full_name, phone, phone_secondary, email, cnp, address, type, notes, agent_id, source, gdpr_consent, gdpr_consent_at, merge_status, lifecycle_status, lifecycle_changed_at, lifecycle_reason, last_relevant_activity_at, archived_at, archive_reason, reactivated_at, created_at')
      .single();

    if (error) return Response.json({ error: errMsg(error) }, { status: 500 });
    const changedFields = ['name', 'phone', 'phone2', 'email', 'cnp', 'address', 'type', 'notes', 'agent_id']
      .filter(field => body[field] !== undefined);
    await appendAuditEvent({
      client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: role,
      action: existing.agent_id !== contact.agent_id ? 'contact.agent_reassigned' : 'contact.updated',
      entityType: 'contact', entityId: contact.id,
      before: { agent_id: existing.agent_id },
      after: { agent_id: contact.agent_id },
      metadata: { changed_fields: changedFields, sensitive_values_omitted: true },
    });
    return Response.json({ contact: toUi(contact as DbContact) });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireApiAuth(request, { module: 'contacts', action: 'delete' });
    if (!auth.ok) return auth.response;
    const { serviceAdmin, user, agencyId, role } = auth.context;
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    const reason = url.searchParams.get('reason')?.trim() || '';
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });
    if (reason.length < 5) {
      return Response.json({ error: 'Motivul arhivării este obligatoriu.' }, { status: 400 });
    }
    const { data, error } = await serviceAdmin.rpc('crm_transition_contact_lifecycle', {
      p_agency_id: agencyId,
      p_actor_id: user.id,
      p_contact_id: id,
      p_to_status: 'arhivat',
      p_reason: reason,
      p_idempotency_key: crypto.randomUUID(),
    });
    if (error) {
      if (error.message.includes('contact_lifecycle_blocked:')) {
        return Response.json({
          error: 'Clientul are elemente active și nu poate fi arhivat.',
        }, { status: 409 });
      }
      if (
        error.message.includes('contact_archive_manager_required')
        || error.message.includes('contact_lifecycle_actor_not_allowed')
      ) {
        return Response.json({ error: 'Nu ai dreptul să arhivezi acest client.' }, { status: 403 });
      }
      return Response.json({ error: errMsg(error) }, { status: 500 });
    }
    await appendAuditEvent({
      client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: role,
      action: 'contact.archived', entityType: 'contact', entityId: id,
      before: { lifecycle_status: data?.from_status || null },
      after: { lifecycle_status: 'arhivat' },
      reason,
    });
    return Response.json({ success: true, archived: true, lifecycle: data });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
