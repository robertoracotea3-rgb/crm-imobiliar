export const dynamic = 'force-dynamic';

import { CRM_ROLES, effectivePermissions } from '@/lib/team-roles';
import { usernameToEmail, normalizeUsername } from '@/lib/username';
import { auditSnapshot } from '@/lib/audit-values';
import { appendAuditEvent } from '@/lib/server/audit-log';
import { contextHasPermission, requireApiAuth } from '@/lib/server/api-auth';
import { isStrongPassword, PASSWORD_POLICY_MESSAGE } from '@/lib/password-policy';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, { module: 'team', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const { admin, serviceAdmin, agencyId, role: callerRole, user } = auth.context;

    const { data: target } = await admin.from('profiles').select('*').eq('id', id).eq('agency_id', agencyId).single();
    if (!target) return Response.json({ error: 'Agent negasit' }, { status: 404 });

    const body = await request.json();
    const { first_name, last_name, phone, job_title, department, role, status, hired_at, avatar_url, notes, permissions, password, username, email } = body;

    if (password !== undefined && !isStrongPassword(password)) {
      return Response.json({ error: PASSWORD_POLICY_MESSAGE }, { status: 400 });
    }

    const { data: authUser } = await serviceAdmin.auth.admin.getUserById(target.user_id);
    const existingMeta = authUser?.user?.user_metadata || {};
    const full_name = [first_name ?? existingMeta.first_name, last_name ?? existingMeta.last_name].filter(Boolean).join(' ') || target.full_name;
    const uname = username?.trim() ? normalizeUsername(username) : (existingMeta.username as string) || '';

    const canChangeRole = contextHasPermission(auth.context, 'team', 'manage_permissions');
    const changesAccountAccess = password !== undefined || username?.trim() || status !== undefined;
    if (changesAccountAccess && !canChangeRole) {
      return Response.json({ error: 'Nu poți modifica accesul acestui cont' }, { status: 403 });
    }
    if (
      target.role === 'owner'
      && callerRole !== 'owner'
      && (changesAccountAccess || role !== undefined || permissions !== undefined)
    ) {
      return Response.json({ error: 'Numai proprietarul poate modifica accesul unui proprietar' }, { status: 403 });
    }
    if ((role !== undefined || permissions !== undefined) && !canChangeRole) {
      return Response.json({ error: 'Nu poți modifica roluri sau permisiuni' }, { status: 403 });
    }
    if (role && !(CRM_ROLES as readonly string[]).includes(role)) {
      return Response.json({ error: 'Rol invalid' }, { status: 400 });
    }
    if (role === 'owner' && callerRole !== 'owner') {
      return Response.json({ error: 'Numai proprietarul poate acorda rolul de proprietar' }, { status: 403 });
    }
    const finalRole = canChangeRole && role ? role : target.role;

    const updatePayload: Record<string, unknown> = {
      user_metadata: {
        ...existingMeta,
        first_name: first_name ?? existingMeta.first_name ?? '',
        last_name: last_name ?? existingMeta.last_name ?? '',
        full_name,
        username: uname,
        contact_email: email ?? existingMeta.contact_email ?? '',
        phone: phone ?? existingMeta.phone ?? '',
        job_title: job_title ?? existingMeta.job_title ?? '',
        department: department ?? existingMeta.department ?? '',
        status: status ?? (target.status === 'active' ? 'activ' : 'inactiv'),
        hired_at: hired_at ?? existingMeta.hired_at ?? null,
        avatar_url: avatar_url ?? existingMeta.avatar_url ?? null,
        notes: notes ?? existingMeta.notes ?? '',
      },
    };
    if (password) updatePayload.password = password;
    if (username?.trim() && usernameToEmail(username) !== (authUser?.user?.email || '')) {
      updatePayload.email = usernameToEmail(username);
      updatePayload.email_confirm = true;
    }

    if (password) {
      const { data: prepared, error: prepareError } = await serviceAdmin.rpc(
        'crm_prepare_password_change',
        {
          p_user_id: target.user_id,
          p_agency_id: agencyId,
          p_actor_id: user.id,
          p_reason: 'administrator_password_reset',
        },
      );
      if (prepareError || prepared !== true) {
        return Response.json({ error: 'Resetarea sigură a parolei nu a putut fi pregătită' }, { status: 503 });
      }
    }

    const { error: authUpdateErr } = await serviceAdmin.auth.admin.updateUserById(target.user_id, updatePayload);
    if (authUpdateErr) {
      const msg = /already (been )?registered|exists|duplicate/i.test(authUpdateErr.message)
        ? `Numele de utilizator "${uname}" este deja folosit.`
        : 'Datele de autentificare nu au putut fi actualizate.';
      return Response.json({ error: msg }, { status: 400 });
    }

    const profileUpdate: Record<string, unknown> = { full_name };
    if (canChangeRole && role) profileUpdate.role = role;
    if (canChangeRole && (role !== undefined || permissions !== undefined)) {
      profileUpdate.permissions = effectivePermissions(
        finalRole,
        permissions !== undefined ? permissions : (role !== undefined ? undefined : target.permissions),
      );
    }
    if (password) {
      profileUpdate.force_password_change = true;
      profileUpdate.security_updated_at = new Date().toISOString();
    }
    if (status !== undefined) {
      profileUpdate.status = status === 'activ' || status === 'active' ? 'active' : 'inactive';
      profileUpdate.disabled_at = profileUpdate.status === 'inactive' ? new Date().toISOString() : null;
      profileUpdate.disabled_by = profileUpdate.status === 'inactive' ? user.id : null;
    }

    const { error: profileUpdateError } = await serviceAdmin
      .from('profiles')
      .update(profileUpdate)
      .eq('id', id)
      .eq('agency_id', agencyId);
    if (profileUpdateError) {
      return Response.json({ error: 'Profilul nu a putut fi actualizat' }, { status: 500 });
    }
    const revokeReason = profileUpdate.status === 'inactive'
      ? 'account_disabled'
      : username?.trim()
        ? 'username_changed'
        : null;
    if (!password && revokeReason) {
      const { error: revokeError } = await serviceAdmin.rpc('crm_revoke_user_sessions', {
        p_user_id: target.user_id,
        p_agency_id: agencyId,
        p_actor_id: user.id,
        p_reason: revokeReason,
      });
      if (revokeError) {
        return Response.json({ error: 'Sesiunile contului nu au putut fi revocate' }, { status: 503 });
      }
    }

    const auditEvents: Promise<string>[] = [];
    if (canChangeRole && role !== undefined && role !== target.role) {
      auditEvents.push(appendAuditEvent({
        client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: callerRole,
        action: 'team.role_changed', entityType: 'profile', entityId: target.id,
        before: { role: target.role }, after: { role: finalRole },
      }));
    }
    if (canChangeRole && permissions !== undefined) {
      auditEvents.push(appendAuditEvent({
        client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: callerRole,
        action: 'team.permissions_changed', entityType: 'profile', entityId: target.id,
        before: { permissions: target.permissions },
        after: { permissions: profileUpdate.permissions },
      }));
    }
    if (password || username?.trim()) {
      auditEvents.push(appendAuditEvent({
        client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: callerRole,
        action: 'auth.credentials_changed', entityType: 'profile', entityId: target.id,
        before: auditSnapshot(target, ['user_id']),
        after: { password_changed: Boolean(password), username_changed: Boolean(username?.trim()) },
      }));
    }
    await Promise.all(auditEvents);

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, { module: 'team', action: 'delete' });
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const { admin, serviceAdmin, agencyId, user, role } = auth.context;

    const { data: target } = await admin.from('profiles').select('*').eq('id', id).eq('agency_id', agencyId).single();
    if (!target) return Response.json({ error: 'Agent negasit' }, { status: 404 });
    if (target.user_id === user.id) return Response.json({ error: 'Nu te poti sterge pe tine' }, { status: 400 });
    if (target.role === 'owner' && role !== 'owner') {
      return Response.json({ error: 'Numai proprietarul poate dezactiva un proprietar' }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const reassignToUserId = body.reassign_to_user_id || null;

    if (reassignToUserId) {
      const { data: reassignTarget } = await admin
        .from('profiles')
        .select('user_id')
        .eq('user_id', reassignToUserId)
        .eq('agency_id', agencyId)
        .single();
      if (!reassignTarget) return Response.json({ error: 'Agentul de reatribuire nu exista in aceasta agentie' }, { status: 400 });

      await serviceAdmin.from('properties').update({ agent_id: reassignToUserId }).eq('agency_id', agencyId).eq('agent_id', target.user_id);
      await serviceAdmin.from('leads').update({ agent_id: reassignToUserId, assigned_to: reassignToUserId }).eq('agency_id', agencyId).or(`agent_id.eq.${target.user_id},assigned_to.eq.${target.user_id}`);
      await serviceAdmin.from('demands').update({ agent_id: reassignToUserId }).eq('agency_id', agencyId).eq('agent_id', target.user_id);
      await serviceAdmin.from('tasks').update({ assigned_to: reassignToUserId }).eq('agency_id', agencyId).eq('assigned_to', target.user_id);
      await serviceAdmin.from('calendar_events').update({ agent_id: reassignToUserId }).eq('agency_id', agencyId).eq('agent_id', target.user_id);
      await appendAuditEvent({
        client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: auth.context.role,
        action: 'team.agent_reassigned', entityType: 'profile', entityId: target.id,
        before: { assigned_user_id: target.user_id },
        after: { assigned_user_id: reassignToUserId },
        reason: typeof body.reason === 'string' ? body.reason : 'Cont dezactivat; datele operaționale au fost realocate.',
      });
    }

    const { error: disableError } = await serviceAdmin.from('profiles').update({
      status: 'inactive',
      disabled_at: new Date().toISOString(),
      disabled_by: user.id,
    }).eq('id', id).eq('agency_id', agencyId);
    if (disableError) {
      return Response.json({ error: 'Contul nu a putut fi dezactivat' }, { status: 500 });
    }
    const { error: revokeError } = await serviceAdmin.rpc('crm_revoke_user_sessions', {
      p_user_id: target.user_id,
      p_agency_id: agencyId,
      p_actor_id: user.id,
      p_reason: 'account_disabled',
    });
    if (revokeError) {
      return Response.json({ error: 'Sesiunile contului nu au putut fi revocate' }, { status: 503 });
    }
    const { data: targetAuth } = await serviceAdmin.auth.admin.getUserById(target.user_id);
    await serviceAdmin.auth.admin.updateUserById(target.user_id, {
      user_metadata: { ...(targetAuth.user?.user_metadata || {}), status: 'inactiv' },
    });
    await serviceAdmin.from('security_events').insert({
      agency_id: agencyId,
      user_id: user.id,
      event_type: 'account_disabled',
      module: 'team',
      action: 'delete',
      entity_type: 'profile',
      entity_id: target.id,
      role: auth.context.role,
      result: 'success',
    });
    await appendAuditEvent({
      client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: auth.context.role,
      action: 'team.member_disabled', entityType: 'profile', entityId: target.id,
      before: auditSnapshot(target, ['user_id', 'role', 'status']),
      after: { user_id: target.user_id, role: target.role, status: 'inactive' },
      reason: typeof body.reason === 'string' ? body.reason : null,
      metadata: { reassigned_to_user_id: reassignToUserId },
    });

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
