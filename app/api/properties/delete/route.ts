export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

export async function DELETE(request: Request) {
  try {
    const auth = await requireApiAuth(request, { module: 'properties', action: 'delete' });
    if (!auth.ok) return auth.response;
    const { admin, user, agencyId } = auth.context;

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });

    const { data: property, error: propertyError } = await admin
      .from('properties')
      .select('id, agency_id, deleted_at')
      .eq('id', id)
      .eq('agency_id', agencyId)
      .single();

    if (propertyError || !property) {
      return Response.json({ error: 'Proprietatea nu există' }, { status: 404 });
    }
    if (property.deleted_at) {
      return Response.json({ success: true, archived: true });
    }

    // Keep business history and media. Permanent purging is intentionally a
    // separate administrative operation that can be audited and recovered.
    const { error } = await admin
      .from('properties')
      .update({
        status: 'arhivata',
        deleted_at: new Date().toISOString(),
        deleted_by: user.id,
      })
      .eq('id', id)
      .eq('agency_id', agencyId);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true, archived: true });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : 'Eroare' },
      { status: 500 },
    );
  }
}
