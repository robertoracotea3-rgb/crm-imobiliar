export const dynamic = 'force-dynamic';

import { scoreMatch } from '@/lib/match-score';
import { requireApiAuth } from '@/lib/server/api-auth';

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'demands', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { property_id: propertyId, demand_id: demandId } = await request.json();
    if (!propertyId || !demandId) {
      return Response.json({ error: 'property_id și demand_id sunt obligatorii' }, { status: 400 });
    }
    const { admin, agencyId } = auth.context;
    const [{ data: property }, { data: demand }] = await Promise.all([
      admin.from('properties').select('*').eq('id', propertyId).eq('agency_id', agencyId).is('deleted_at', null).maybeSingle(),
      admin.from('demands').select('*').eq('id', demandId).eq('agency_id', agencyId).is('deleted_at', null).maybeSingle(),
    ]);
    if (!property || !demand) return Response.json({ error: 'Proprietatea sau cererea nu este accesibilă' }, { status: 404 });
    return Response.json({ success: true, ...scoreMatch(property, demand) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Eroare la calcularea scorului' }, { status: 500 });
  }
}
