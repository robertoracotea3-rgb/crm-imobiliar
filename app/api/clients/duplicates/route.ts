export const dynamic = 'force-dynamic';

import { contextCanManageAll, requireApiAuth } from '@/lib/server/api-auth';
import { appendAuditEvent } from '@/lib/server/audit-log';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'contacts', action: 'view' });
  if (!auth.ok) return auth.response;
  if (!contextCanManageAll(auth.context, 'contacts')) {
    return Response.json({ error: 'Doar managerii pot verifica duplicatele' }, { status: 403 });
  }
  const { serviceAdmin, agencyId, user, role } = auth.context;
  const url = new URL(request.url);
  const status = url.searchParams.get('status') || 'pending';
  if (!['pending', 'merged', 'rejected', 'reverted'].includes(status)) {
    return Response.json({ error: 'Status invalid' }, { status: 400 });
  }

  const { data: candidates, error } = await serviceAdmin
    .from('client_merge_candidates')
    .select('id, primary_contact_id, duplicate_contact_id, confidence, reasons, status, detected_at, decided_at, decision_note')
    .eq('agency_id', agencyId)
    .eq('status', status)
    .order('confidence', { ascending: false })
    .order('detected_at', { ascending: false })
    .limit(200);
  if (error) return Response.json({ error: 'Lista duplicatelor nu a putut fi încărcată' }, { status: 500 });

  const contactIds = [...new Set((candidates || []).flatMap((candidate) => [
    candidate.primary_contact_id,
    candidate.duplicate_contact_id,
  ]))];
  const { data: contacts } = contactIds.length
    ? await serviceAdmin.from('contacts')
      .select('id, full_name, phone, phone_secondary, email, agent_id, source, created_at, merge_status, merged_into_id')
      .eq('agency_id', agencyId)
      .in('id', contactIds)
    : { data: [] };
  const contactMap = Object.fromEntries((contacts || []).map((contact) => [contact.id, contact]));

  const { data: operations } = await serviceAdmin
    .from('client_merge_operations')
    .select('id, primary_contact_id, merged_contact_id, reason, status, merged_at, reverted_at, revert_reason')
    .eq('agency_id', agencyId)
    .order('merged_at', { ascending: false })
    .limit(100);

  await appendAuditEvent({
    client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: role,
    action: 'contact.duplicate_review_viewed', entityType: 'contact',
    metadata: { candidate_count: candidates?.length || 0, status },
  });

  return Response.json({
    candidates: (candidates || []).map((candidate) => ({
      ...candidate,
      primary: contactMap[candidate.primary_contact_id] || null,
      duplicate: contactMap[candidate.duplicate_contact_id] || null,
    })),
    operations: operations || [],
  });
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'contacts', action: 'edit' });
  if (!auth.ok) return auth.response;
  if (!contextCanManageAll(auth.context, 'contacts')) {
    return Response.json({ error: 'Doar managerii pot uni sau restaura profiluri' }, { status: 403 });
  }
  const { serviceAdmin, agencyId, user } = auth.context;
  const body = await request.json().catch(() => ({}));
  const reason = String(body.reason || '').trim();
  if (reason.length < 3) return Response.json({ error: 'Motivul este obligatoriu' }, { status: 400 });

  if (body.action === 'merge') {
    if (!UUID.test(body.primary_contact_id || '') || !UUID.test(body.duplicate_contact_id || '')) {
      return Response.json({ error: 'Contacte invalide' }, { status: 400 });
    }
    const { data: operationId, error } = await serviceAdmin.rpc('merge_crm_contacts', {
      p_agency_id: agencyId,
      p_primary_contact_id: body.primary_contact_id,
      p_duplicate_contact_id: body.duplicate_contact_id,
      p_actor_id: user.id,
      p_reason: reason,
    });
    if (error) return Response.json({ error: 'Profilurile nu au putut fi unite în siguranță' }, { status: 409 });
    await appendAuditEvent({
      client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: auth.context.role,
      action: 'contact.merged', entityType: 'contact_merge', entityId: String(operationId),
      before: { primary_contact_id: body.primary_contact_id, duplicate_contact_id: body.duplicate_contact_id },
      after: { retained_contact_id: body.primary_contact_id, merged_contact_id: body.duplicate_contact_id },
      reason,
    });
    return Response.json({ success: true, operation_id: operationId });
  }

  if (body.action === 'revert') {
    if (!UUID.test(body.operation_id || '')) return Response.json({ error: 'Operație invalidă' }, { status: 400 });
    const { error } = await serviceAdmin.rpc('revert_crm_contact_merge', {
      p_agency_id: agencyId,
      p_operation_id: body.operation_id,
      p_actor_id: user.id,
      p_reason: reason,
    });
    if (error) return Response.json({ error: 'Unirea nu a putut fi anulată în siguranță' }, { status: 409 });
    await appendAuditEvent({
      client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: auth.context.role,
      action: 'contact.merge_reverted', entityType: 'contact_merge', entityId: body.operation_id,
      after: { reverted: true }, reason,
    });
    return Response.json({ success: true });
  }

  if (body.action === 'reject') {
    if (!UUID.test(body.candidate_id || '')) return Response.json({ error: 'Propunere invalidă' }, { status: 400 });
    const { data, error } = await serviceAdmin
      .from('client_merge_candidates')
      .update({ status: 'rejected', decided_at: new Date().toISOString(), decided_by: user.id, decision_note: reason })
      .eq('id', body.candidate_id)
      .eq('agency_id', agencyId)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (error || !data) return Response.json({ error: 'Propunerea nu a putut fi respinsă' }, { status: 409 });
    await appendAuditEvent({
      client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: auth.context.role,
      action: 'contact.merge_rejected', entityType: 'contact_merge_candidate', entityId: data.id,
      after: { status: 'rejected' }, reason,
    });
    return Response.json({ success: true });
  }

  return Response.json({ error: 'Acțiune invalidă' }, { status: 400 });
}
