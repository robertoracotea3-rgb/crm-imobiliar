export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'team', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, serviceAdmin, agencyId } = auth.context;
    const { data: profiles } = await admin
      .from('profiles')
      .select('user_id, role')
      .eq('agency_id', agencyId);

    if (!profiles || profiles.length === 0) return Response.json({ agents: [] });

    const agents: { id: string; email: string; role: string }[] = [];
    for (const profile of profiles) {
      const { data: authUser } = await serviceAdmin.auth.admin.getUserById(profile.user_id);
      if (authUser?.user) {
        const meta = authUser.user.user_metadata;
        const name = meta?.full_name || meta?.name || authUser.user.email?.split('@')[0] || profile.user_id;
        agents.push({ id: profile.user_id, email: name, role: profile.role || 'agent' });
      }
    }

    return Response.json({ agents });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
