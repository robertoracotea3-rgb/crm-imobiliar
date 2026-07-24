export const dynamic = 'force-dynamic';

import { appendAuditEvent } from '@/lib/server/audit-log';
import { isContactLifecycleStatus } from '@/lib/contact-lifecycle';
import { requireApiAuth } from '@/lib/server/api-auth';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseBlockers(message: string): string[] {
  const marker = 'contact_lifecycle_blocked:';
  const start = message.indexOf(marker);
  if (start < 0) return [];
  try {
    const parsed = JSON.parse(message.slice(start + marker.length));
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    return [];
  }
}

function lifecycleError(message: string) {
  const blockers = parseBlockers(message);
  if (blockers.length) {
    return {
      status: 409,
      body: { error: 'Starea clientului nu poate fi schimbată.', blockers },
    };
  }
  if (message.includes('contact_archive_reason_required')) {
    return {
      status: 400,
      body: { error: 'Motivul arhivării este obligatoriu și trebuie să fie explicit.' },
    };
  }
  if (
    message.includes('contact_lifecycle_actor_not_allowed')
    || message.includes('contact_archive_manager_required')
  ) {
    return {
      status: 403,
      body: { error: 'Nu ai dreptul să faci această schimbare pentru client.' },
    };
  }
  if (message.includes('invalid_contact_lifecycle_transition')) {
    return {
      status: 409,
      body: { error: 'Această trecere nu este permisă din starea actuală.' },
    };
  }
  if (message.includes('contact_not_found')) {
    return { status: 404, body: { error: 'Clientul nu mai este disponibil.' } };
  }
  return {
    status: 500,
    body: { error: 'Starea clientului nu a putut fi actualizată.' },
  };
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'contacts', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin, agencyId, user, role } = auth.context;
  const body = await request.json().catch(() => ({}));
  const contactId = typeof body.contact_id === 'string' ? body.contact_id : '';
  const toStatus = typeof body.to_status === 'string' ? body.to_status : '';
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const idempotencyKey = typeof body.idempotency_key === 'string'
    ? body.idempotency_key.trim()
    : '';

  if (
    !UUID.test(contactId)
    || !isContactLifecycleStatus(toStatus)
    || !idempotencyKey
  ) {
    return Response.json({ error: 'Datele schimbării sunt invalide.' }, { status: 400 });
  }
  if (toStatus === 'arhivat' && reason.length < 5) {
    return Response.json({
      error: 'Motivul arhivării este obligatoriu și trebuie să aibă cel puțin 5 caractere.',
    }, { status: 400 });
  }

  const { data: blockers, error: blockersError } = await serviceAdmin.rpc(
    'crm_contact_lifecycle_blockers',
    {
      p_agency_id: agencyId,
      p_contact_id: contactId,
      p_to_status: toStatus,
      p_now: new Date().toISOString(),
      p_old_after_days: 60,
    },
  );
  if (blockersError) {
    return Response.json({ error: 'Regulile clientului nu au putut fi verificate.' }, { status: 500 });
  }
  if (Array.isArray(blockers) && blockers.length) {
    return Response.json({
      error: 'Starea clientului nu poate fi schimbată.',
      blockers: blockers.map(String),
    }, { status: 409 });
  }

  const { data, error } = await serviceAdmin.rpc('crm_transition_contact_lifecycle', {
    p_agency_id: agencyId,
    p_actor_id: user.id,
    p_contact_id: contactId,
    p_to_status: toStatus,
    p_reason: reason || null,
    p_idempotency_key: idempotencyKey,
  });
  if (error) {
    const mapped = lifecycleError(error.message);
    return Response.json(mapped.body, { status: mapped.status });
  }

  await appendAuditEvent({
    client: serviceAdmin,
    request,
    agencyId,
    actorUserId: user.id,
    actorRole: role,
    action: toStatus === 'arhivat'
      ? 'contact.archived'
      : data?.from_status === 'arhivat'
        ? 'contact.reactivated'
        : 'contact.lifecycle_changed',
    entityType: 'contact',
    entityId: contactId,
    before: { lifecycle_status: data?.from_status || null },
    after: { lifecycle_status: data?.status || toStatus },
    reason: reason || null,
  });

  return Response.json({ lifecycle: data });
}
