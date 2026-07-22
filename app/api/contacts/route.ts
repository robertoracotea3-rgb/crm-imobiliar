export const dynamic = 'force-dynamic';

import { normalizeLeadSource } from '@/lib/crm-catalogs';
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
    created_at: c.created_at,
  };
}

export async function GET(request: Request) {
  try {
    const auth = await requireApiAuth(request, { module: 'contacts', action: 'view' });
    if (!auth.ok) return auth.response;
    const { admin, agencyId } = auth.context;
    const { data, error } = await admin
      .from('contacts')
      .select('id, full_name, phone, phone_secondary, email, cnp, address, type, notes, agent_id, source, gdpr_consent, gdpr_consent_at, merge_status, created_at')
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .eq('merge_status', 'active')
      .order('full_name')
      .limit(500);
    if (error) return Response.json({ error: errMsg(error), contacts: [] });
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
      .select('id, full_name, phone, phone_secondary, email, cnp, address, type, notes, agent_id, source, gdpr_consent, gdpr_consent_at, merge_status, created_at')
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
    const { admin, user, agencyId } = auth.context;
    const body = await request.json();
    const { id, name, phone, phone2, email, cnp, address, type, notes, agent_id } = body;
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });
    if (!name?.trim()) return Response.json({ error: 'Numele este obligatoriu' }, { status: 400 });

    if (agent_id && agent_id !== user.id && !contextHasPermission(auth.context, 'contacts', 'assign')) {
      return Response.json({ error: 'Nu poți atribui clientul altui agent' }, { status: 403 });
    }

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
      .select('id, full_name, phone, phone_secondary, email, cnp, address, type, notes, agent_id, source, gdpr_consent, gdpr_consent_at, merge_status, created_at')
      .single();

    if (error) return Response.json({ error: errMsg(error) }, { status: 500 });
    return Response.json({ contact: toUi(contact as DbContact) });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const auth = await requireApiAuth(request, { module: 'contacts', action: 'delete' });
    if (!auth.ok) return auth.response;
    const { admin, serviceAdmin, user, agencyId } = auth.context;
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });

    const references = [
      { table: 'leads', column: 'contact_id', softDeleted: true },
      { table: 'demands', column: 'contact_id', softDeleted: true },
      { table: 'calendar_events', column: 'contact_id', softDeleted: true },
      { table: 'transactions', column: 'contact_id', softDeleted: true },
      { table: 'activities', column: 'contact_id', softDeleted: false },
      { table: 'properties', column: 'owner_contact_id', softDeleted: true },
    ] as const;
    for (const reference of references) {
      let query = serviceAdmin.from(reference.table)
        .select('id', { count: 'exact', head: true })
        .eq('agency_id', agencyId)
        .eq(reference.column, id);
      if (reference.softDeleted) query = query.is('deleted_at', null);
      const { count } = await query;
      if ((count || 0) > 0) {
        return Response.json({
          error: 'Clientul are istoric CRM. Arhivează leadurile sau unește profilul din secțiunea Duplicate.',
        }, { status: 409 });
      }
    }

    const { error } = await admin.from('contacts')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq('id', id)
      .eq('agency_id', agencyId)
      .eq('merge_status', 'active')
      .is('deleted_at', null);

    if (error) return Response.json({ error: errMsg(error) }, { status: 500 });
    return Response.json({ success: true, archived: true });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
