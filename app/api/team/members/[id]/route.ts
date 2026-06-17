export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import { DEFAULT_PERMISSIONS } from '@/lib/team-roles';
import { usernameToEmail, normalizeUsername } from '@/lib/username';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getCallerProfile(token: string) {
  const { data: { user } } = await admin.auth.getUser(token);
  if (!user) return null;
  const { data: profile } = await admin.from('profiles').select('*').eq('user_id', user.id).single();
  return profile;
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const caller = await getCallerProfile(token);
    if (!caller) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: target } = await admin.from('profiles').select('*').eq('id', id).eq('agency_id', caller.agency_id).single();
    if (!target) return Response.json({ error: 'Agent negasit' }, { status: 404 });

    const canEdit = ['owner', 'admin', 'manager'].includes(caller.role) || caller.id === id;
    if (!canEdit) return Response.json({ error: 'Acces interzis' }, { status: 403 });

    const body = await request.json();
    const { first_name, last_name, phone, job_title, department, role, status, hired_at, avatar_url, notes, permissions, password, username, email } = body;

    const { data: authUser } = await admin.auth.admin.getUserById(target.user_id);
    const existingMeta = authUser?.user?.user_metadata || {};
    const full_name = [first_name ?? existingMeta.first_name, last_name ?? existingMeta.last_name].filter(Boolean).join(' ') || target.full_name;

    // Changing the username changes the login email (username@fortis.crm).
    const uname = username?.trim() ? normalizeUsername(username) : (existingMeta.username as string) || '';

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
        status: status ?? existingMeta.status ?? 'activ',
        hired_at: hired_at ?? existingMeta.hired_at ?? null,
        avatar_url: avatar_url ?? existingMeta.avatar_url ?? null,
        notes: notes ?? existingMeta.notes ?? '',
        permissions: permissions ?? existingMeta.permissions ?? DEFAULT_PERMISSIONS[role ?? target.role] ?? DEFAULT_PERMISSIONS.agent,
      },
    };
    if (password) updatePayload.password = password;
    // Update the login email only when the username actually changed.
    if (username?.trim() && usernameToEmail(username) !== (authUser?.user?.email || '')) {
      updatePayload.email = usernameToEmail(username);
      updatePayload.email_confirm = true;
    }

    const { error: authUpdateErr } = await admin.auth.admin.updateUserById(target.user_id, updatePayload);
    if (authUpdateErr) {
      const msg = /already (been )?registered|exists|duplicate/i.test(authUpdateErr.message)
        ? `Numele de utilizator "${uname}" este deja folosit.`
        : authUpdateErr.message;
      return Response.json({ error: msg }, { status: 400 });
    }

    const profileUpdate: Record<string, unknown> = { full_name };
    if (role && ['owner', 'admin'].includes(caller.role)) profileUpdate.role = role;

    await admin.from('profiles').update(profileUpdate).eq('id', id);

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const caller = await getCallerProfile(token);
    if (!caller) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    if (!['owner', 'admin'].includes(caller.role)) {
      return Response.json({ error: 'Acces interzis' }, { status: 403 });
    }

    const { data: target } = await admin.from('profiles').select('*').eq('id', id).eq('agency_id', caller.agency_id).single();
    if (!target) return Response.json({ error: 'Agent negasit' }, { status: 404 });
    if (target.user_id === caller.user_id) return Response.json({ error: 'Nu te poti sterge pe tine' }, { status: 400 });

    const body = await request.json().catch(() => ({}));
    const reassignToUserId = body.reassign_to_user_id || null;

    if (reassignToUserId) {
      await admin.from('properties').update({ agent_id: reassignToUserId }).eq('agency_id', caller.agency_id).eq('agent_id', target.user_id);
      await admin.from('demands').update({ agent_id: reassignToUserId }).eq('agency_id', caller.agency_id).eq('agent_id', target.user_id);
    }

    await admin.from('profiles').delete().eq('id', id);
    await admin.auth.admin.deleteUser(target.user_id);

    return Response.json({ ok: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
