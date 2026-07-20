export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

export async function GET(request: Request) {
  try {
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });

    const auth = await requireApiAuth(request, { module: 'properties', action: 'view' });
    if (!auth.ok) return auth.response;
    const { admin, agencyId } = auth.context;

    const { data: property, error } = await admin
      .from('properties')
      .select('*')
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    if (!property) return Response.json({ error: 'Proprietatea nu există' }, { status: 404 });
    return Response.json({ property });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Eroare internă' },
      { status: 500 },
    );
  }
}
