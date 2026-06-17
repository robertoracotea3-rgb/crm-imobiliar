export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import { DEFAULT_PERMISSIONS } from '@/lib/team-roles';
import { usernameToEmail, normalizeUsername, emailToUsername } from '@/lib/username';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: myProfile } = await admin
      .from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!myProfile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const { data: profiles } = await admin
      .from('profiles')
      .select('*')
      .eq('agency_id', myProfile.agency_id)
      .order('created_at', { ascending: true });

    if (!profiles) return Response.json({ members: [] });

    const agencyId = myProfile.agency_id;
    const userIds = profiles.map(p => p.user_id);

    // Batch all data in parallel — no N+1
    const [authResults, { data: allProps }, { data: allDemands }] = await Promise.all([
      Promise.all(userIds.map(uid => admin.auth.admin.getUserById(uid))),
      admin.from('properties')
        .select('agent_id, status')
        .eq('agency_id', agencyId)
        .in('agent_id', userIds)
        .limit(2000),
      admin.from('demands')
        .select('agent_id')
        .eq('agency_id', agencyId)
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
    (allProps || []).forEach(p => {
      if (p.status === 'activa') propActiveMap[p.agent_id] = (propActiveMap[p.agent_id] || 0) + 1;
      if (SOLD_STATUSES.has(p.status)) propSoldMap[p.agent_id] = (propSoldMap[p.agent_id] || 0) + 1;
    });
    const demandsMap: Record<string, number> = {};
    (allDemands || []).forEach(d => { demandsMap[d.agent_id] = (demandsMap[d.agent_id] || 0) + 1; });

    const members = profiles.map(p => {
      const auth = authMap[p.user_id] || { email: '', last_sign_in_at: null, user_metadata: {} };
      const meta = auth.user_metadata;
      return {
        id: p.id,
        user_id: p.user_id,
        agency_id: p.agency_id,
        email: auth.email,
        username: (meta.username as string) || emailToUsername(auth.email),
        contact_email: (meta.contact_email as string) || '',
        full_name: p.full_name || (meta.full_name as string) || '',
        first_name: (meta.first_name as string) || '',
        last_name: (meta.last_name as string) || '',
        phone: (meta.phone as string) || '',
        job_title: (meta.job_title as string) || '',
        department: (meta.department as string) || '',
        role: p.role || 'agent',
        status: (meta.status as string) || 'activ',
        hired_at: (meta.hired_at as string) || null,
        avatar_url: (meta.avatar_url as string) || null,
        notes: (meta.notes as string) || '',
        permissions: meta.permissions || DEFAULT_PERMISSIONS[p.role] || DEFAULT_PERMISSIONS.agent,
        created_at: p.created_at,
        last_sign_in_at: auth.last_sign_in_at,
        stats: {
          properties_active: propActiveMap[p.user_id] || 0,
          properties_sold: propSoldMap[p.user_id] || 0,
          demands: demandsMap[p.user_id] || 0,
        },
      };
    });

    return Response.json({ members });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: myProfile } = await admin
      .from('profiles').select('agency_id, role').eq('user_id', user.id).single();
    if (!myProfile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const allowed = ['owner', 'admin', 'manager'];
    if (!allowed.includes(myProfile.role)) {
      return Response.json({ error: 'Acces interzis' }, { status: 403 });
    }

    const body = await request.json();
    const { email, username, password, first_name, last_name, phone, job_title, department, role, hired_at, permissions } = body;

    if (!username?.trim() || !password) return Response.json({ error: 'Nume utilizator și parolă sunt obligatorii' }, { status: 400 });

    const uname = normalizeUsername(username);
    const loginEmail = usernameToEmail(username);  // ex: "robert" → "robert@fortis.crm"
    const full_name = [first_name, last_name].filter(Boolean).join(' ') || uname;

    const { data: newUser, error: createError } = await admin.auth.admin.createUser({
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
        permissions: permissions || DEFAULT_PERMISSIONS[role] || DEFAULT_PERMISSIONS.agent,
      },
    });

    if (createError) {
      const msg = /already (been )?registered|exists|duplicate/i.test(createError.message)
        ? `Numele de utilizator "${uname}" este deja folosit.`
        : createError.message;
      return Response.json({ error: msg }, { status: 400 });
    }

    const { data: profile, error: profileError } = await admin.from('profiles').insert([{
      user_id: newUser.user.id,
      agency_id: myProfile.agency_id,
      role: role || 'agent',
      full_name,
    }]).select().single();

    if (profileError) {
      await admin.auth.admin.deleteUser(newUser.user.id);
      return Response.json({ error: profileError.message }, { status: 500 });
    }

    return Response.json({ member: { ...profile, email: loginEmail, username: uname } }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
