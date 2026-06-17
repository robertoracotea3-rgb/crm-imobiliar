export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

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

    const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    // Fetch all profiles for this agency
    const { data: profiles } = await admin
      .from('profiles')
      .select('user_id, role')
      .eq('agency_id', profile.agency_id);

    if (!profiles || profiles.length === 0) return Response.json({ agents: [] });

    // Get user emails from auth
    const userIds = profiles.map((p) => p.user_id);
    const agents: { id: string; email: string; role: string }[] = [];

    for (const uid of userIds) {
      const { data: authUser } = await admin.auth.admin.getUserById(uid);
      if (authUser?.user) {
        const meta = authUser.user.user_metadata;
        const name = meta?.full_name || meta?.name || authUser.user.email?.split('@')[0] || uid;
        const role = profiles.find((p) => p.user_id === uid)?.role || 'agent';
        agents.push({ id: uid, email: name, role });
      }
    }

    return Response.json({ agents });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
