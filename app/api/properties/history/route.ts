export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'properties', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;
    const propertyId = new URL(request.url).searchParams.get('property_id');
    if (!propertyId) return Response.json({ error: 'property_id lipsa' }, { status: 400 });

    const { data: property } = await admin
      .from('properties')
      .select('id')
      .eq('id', propertyId)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!property) return Response.json({ error: 'Proprietate negasita' }, { status: 404 });

    const { data, error } = await admin
      .from('activity_logs')
      .select('id, action, field, old_value, new_value, user_name, created_at')
      .eq('agency_id', agencyId)
      .eq('entity_type', 'property')
      .eq('entity_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      if (/relation|does not exist/i.test(error.message)) return Response.json({ logs: [], needsMigration: true });
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ logs: data || [] });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
