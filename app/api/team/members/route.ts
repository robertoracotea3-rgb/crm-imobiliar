export const dynamic = 'force-dynamic';

import { effectivePermissions } from '@/lib/team-roles';
import { usernameToEmail, normalizeUsername, emailToUsername } from '@/lib/username';
import { appendAuditEvent } from '@/lib/server/audit-log';
import { requireApiAuth } from '@/lib/server/api-auth';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'team', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, serviceAdmin, agencyId } = auth.context;

    const { data: profiles } = await admin
      .from('profiles')
      .select('*')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: true });

    if (!profiles) return Response.json({ members: [] });

    const userIds = profiles.map((p) => p.user_id);
    const [authResults, { data: allProps }, { data: allLeads }] = await Promise.all([
      Promise.all(userIds.map((uid) => serviceAdmin.auth.admin.getUserById(uid))),
      admin.from('properties')
        .select('agent_id, status')
        .eq('agency_id', agencyId)
        .is('deleted_at', null)
        .in('agent_id', userIds)
        .limit(2000),
      admin.from('leads')
        .select('agent_id')
        .eq('agency_id', agencyId)
        .is('deleted_at', null)
        .in('agent_id', userIds)
        .limit(2000),
    ]);

    const authMap: Record<string, { email: string; last_sign_in_at: string | null; user_metadata: Record<string, unknown> }> = {};
    authResults.forEach(({ data }) => {
      if (data?.user) {
        authMap[data.user.id] = {
          email: data.user.email || '',
          last_sign_in_at: data.user.last_sign_in_at || null,
          user_metadata: data.user.user_metadata || {},
        };
      }
    });

    const SOLD_STATUSES = new Set(['tranzactionata', 'vanduta_noi', 'vanduta_altii', 'inchiriata']);
    const propActiveMap: Record<string, number> = {};
    const propSoldMap: Record<string, number> = {};
    (allProps || []).forEach((p) => {
      if (p.status === 'activa') propActiveMap[p.agent_id] = (propActiveMap[p.agent_id] || 0) + 1;
      if (SOLD_STATUSES.has(p.status)) propSoldMap[p.agent_id] = (propSoldMap[p.agent_id] || 0) + 1;
    });
    const clientsMap: Record<string, number> = {};
    (allLeads || []).forEach((l) => {
      clientsMap[l.agent_id] = (clientsMap[l.agent_id] || 0) + 1;
    });

    const members = profiles.map((p) => {
      const authUser = authMap[p.user_id] || { email: '', last_sign_in_at: null, user_metadata: {} };
      const meta = authUser.user_metadata;
      return {
        id: p.id,
        user_id: p.user_id,
        agency_id: p.agency_id,
        email: authUser.email,
        username: (meta.username as string) || emailToUsername(authUser.email),
        contact_email: (meta.contact_email as string) || '',
        full_name: p.full_name || (meta.full_name as string) || '',
        first_name: (meta.first_name as string) || '',
        last_name: (meta.last_name as string) || '',
        phone: (meta.phone as string) || '',
        job_title: (meta.job_title as string) || '',
        department: (meta.department as string) || '',
        role: p.role || 'agent',
        status: p.status === 'active' ? 'activ' : 'inactiv',
        hired_at: (meta.hired_at as string) || null,
        avatar_url: (meta.avatar_url as string) || null,
        notes: (meta.notes as string) || '',
        permissions: effectivePermissions(p.role, p.permissions),
        created_at: p.created_at,
        last_sign_in_at: authUser.last_sign_in_at,
        stats: {
          properties_active: propActiveMap[p.user_id] || 0,
          properties_sold: propSoldMap[p.user_id] || 0,
          clients: clientsMap[p.user_id] || 0,
        },
      };
    });

    return Response.json({ members });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'team', action: 'create' });
  if (!auth.ok) return auth.response;

  try {
    const { serviceAdmin, agencyId, role: myRole, user } = auth.context;

    const body = await request.json();
    const { email, username, password, first_name, last_name, phone, job_title, department, role, hired_at, permissions } = body;

    if (!username?.trim() || !password) return Response.json({ error: 'Nume utilizator si parola sunt obligatorii' }, { status: 400 });
    if (typeof password !== 'string' || password.length < 12) return Response.json({ error: 'Parola trebuie sa aiba cel putin 12 caractere' }, { status: 400 });

    const allowedRoles = ['admin', 'manager', 'agent_senior', 'agent', 'assistant', 'accountant', 'viewer'];
    const finalRole = allowedRoles.includes(role) ? role : 'agent';
    if (myRole === 'manager' && ['owner', 'admin', 'manager'].includes(finalRole)) {
      return Response.json({ error: 'Managerul poate crea doar agenti sau asistenti' }, { status: 403 });
    }

    const uname = normalizeUsername(username);
    const loginEmail = usernameToEmail(username);
    const full_name = [first_name, last_name].filter(Boolean).join(' ') || uname;

    const { data: newUser, error: createError } = await serviceAdmin.auth.admin.createUser({
      email: loginEmail,
      password,
      email_confirm: true,
      user_metadata: {
        full_name,
        username: uname,
        contact_email: email || '',
        first_name: first_name || '',
        last_name: last_name || '',
        phone: phone || '',
        job_title: job_title || '',
        department: department || '',
        status: 'activ',
        hired_at: hired_at || null,
      },
    });

    if (createError) {
      const msg = /already (been )?registered|exists|duplicate/i.test(createError.message)
        ? `Numele de utilizator "${uname}" este deja folosit.`
        : createError.message;
      return Response.json({ error: msg }, { status: 400 });
    }

    const { data: profile, error: profileError } = await serviceAdmin.from('profiles').insert([{
      user_id: newUser.user.id,
      agency_id: agencyId,
      role: finalRole,
      full_name,
      status: 'active',
      permissions: effectivePermissions(finalRole, permissions),
    }]).select().single();

    if (profileError) {
      await serviceAdmin.auth.admin.deleteUser(newUser.user.id);
      return Response.json({ error: profileError.message }, { status: 500 });
    }

    await appendAuditEvent({
      client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: myRole,
      action: 'team.member_created', entityType: 'profile', entityId: profile.id,
      after: {
        user_id: newUser.user.id,
        role: finalRole,
        permissions: profile.permissions,
        status: 'active',
      },
    });

    return Response.json({ member: { ...profile, email: loginEmail, username: uname } }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
