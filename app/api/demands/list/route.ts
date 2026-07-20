export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'demands', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;

    const { data, error } = await admin
      .from('demands')
      .select('*')
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ demands: data || [] });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
