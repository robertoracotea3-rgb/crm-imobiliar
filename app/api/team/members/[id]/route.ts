export const dynamic = 'force-dynamic';

import { CRM_ROLES, effectivePermissions } from '@/lib/team-roles';
import { usernameToEmail, normalizeUsername } from '@/lib/username';
import { contextHasPermission, requireApiAuth } from '@/lib/server/api-auth';

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireApiAuth(request, { module: 'team', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { id } = await params;
    const { admin, serviceAdmin, agencyId, role: callerRole } = auth.context;

    const { data: target } = await admin.from('profiles').select('*').eq('id', id).eq('agency_id', agencyId).single();
    if (!target) return Response.json({ error: 'Agent negasit' }, { status: 404 });

    const body = await request.json();
    const { first_name, last_name, phone, job_title, department, role, status, hired_at, avatar_url, notes, permissions, password, username, email } = body;

    if (password !== undefined && (typeof password !== 'string' || password.length < 12)) {
      return Response.json({ error: 'Parola trebuie sa aiba cel putin 12 caractere' }, { status: 400 });
    }

    const { data: authUser } = await serviceAdmin.auth.admin.getUserById(target.user_id);
    const existingMeta = authUser?.user?.user_metadata || {};
    const full_name = [first_name ?? existingMeta.first_name, last_name ?? existingMeta.last_name].filter(Boolean).join(' ') || target.full_name;
    const uname = username?.trim() ? normalizeUsername(username) : (existingMeta.username as string) || '';

    const canChangeRole = contextHasPermission(auth.context, 'team', 'manage_permissions');
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

    const { error: authUpdateErr } = await serviceAdmin.auth.admin.updateUserById(target.user_id, updatePayload);
    if (authUpdateErr) {
      const msg = /already (been )?registered|exists|duplicate/i.test(authUpdateErr.message)
        ? `Numele de utilizator "${uname}" este deja folosit.`
        : authUpdateErr.message;
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

    await serviceAdmin.from('profiles').update(profileUpdate).eq('id', id).eq('agency_id', agencyId);

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
    const { admin, serviceAdmin, agencyId, user } = auth.context;

    const { data: target } = await admin.from('profiles').select('*').eq('id', id).eq('agency_id', agencyId).single();
    if (!target) return Response.json({ error: 'Agent negasit' }, { status: 404 });
    if (target.user_id === user.id) return Response.json({ error: 'Nu te poti sterge pe tine' }, { status: 400 });

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
    }

    await serviceAdmin.from('profiles').update({
      status: 'inactive',
      disabled_at: new Date().toISOString(),
      disabled_by: user.id,
    }).eq('id', id).eq('agency_id', agencyId);
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

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
