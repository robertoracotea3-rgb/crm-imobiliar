export const dynamic = 'force-dynamic';

import { isPropertySearchIntent } from '@/lib/demand-record';
import { scoreMatch } from '@/lib/match-score';
import { requireApiAuth } from '@/lib/server/api-auth';
import { refreshDemandMatchesForProperty } from '@/lib/server/demand-matching';

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'demands', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, serviceAdmin, agencyId } = auth.context;
    const propertyId = new URL(request.url).searchParams.get('property_id');
    if (!propertyId) return Response.json({ error: 'property_id lipsește' }, { status: 400 });

    const { data: property, error: propertyError } = await admin.from('properties')
      .select('id, internal_code, title, city, county, zone, price, currency, category, transaction, latitude, longitude, surface_useful, surface_land, attributes')
      .eq('id', propertyId).eq('agency_id', agencyId).is('deleted_at', null).maybeSingle();
    if (propertyError) return Response.json({ error: propertyError.message }, { status: 500 });
    if (!property) return Response.json({ error: 'Proprietatea nu a fost găsită' }, { status: 404 });

    await refreshDemandMatchesForProperty(serviceAdmin, agencyId, propertyId);

    const query = admin.from('demands').select('*')
      .eq('agency_id', agencyId)
      .eq('status', 'activa')
      .eq('transaction', property.transaction)
      .contains('property_types', [property.category])
      .is('deleted_at', null)
      .limit(1000);

    const { data: demands, error: demandError } = await query;
    if (demandError) return Response.json({ error: demandError.message }, { status: 500 });
    const scored = (demands || [])
      .filter((demand) => isPropertySearchIntent(demand.intent))
      .map((demand) => ({ ...demand, ...scoreMatch(property, demand) }))
      .filter((demand) => demand.eligible && demand.score >= 30)
      .sort((a, b) => b.score - a.score || b.coverage - a.coverage);

    const contactIds = [...new Set(scored.map((demand) => demand.contact_id).filter(Boolean))];
    const { data: contacts } = contactIds.length > 0
      ? await admin.from('contacts').select('id, full_name, phone, email').eq('agency_id', agencyId).in('id', contactIds)
      : { data: [] as Array<{ id: string; full_name: string }> };
    const contactMap = new Map((contacts || []).map((contact) => [contact.id, contact]));

    return Response.json({
      matches: scored.map((demand) => ({ ...demand, contact: contactMap.get(demand.contact_id) || null })),
      server_filtered: true,
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Eroare' }, { status: 500 });
  }
}
