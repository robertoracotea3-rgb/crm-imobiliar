export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(request, { module: 'demands', action: 'delete' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId, user } = auth.context;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'ID lipsa' }, { status: 400 });

    const { data: demand } = await admin
      .from('demands')
      .select('id')
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!demand) return Response.json({ error: 'Cererea nu exista' }, { status: 404 });

    const { error } = await admin
      .from('demands')
      .update({
        status: 'anulata',
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
      })
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
