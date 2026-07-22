export const dynamic = 'force-dynamic';

import { isPropertySearchIntent } from '@/lib/demand-record';
import { scoreMatch } from '@/lib/match-score';
import { requireApiAuth } from '@/lib/server/api-auth';

// Property pages keep this historical URL, but results now originate from
// canonical demands instead of disconnected lead copies.
export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'properties', action: 'view' });
  if (!auth.ok) return auth.response;
  try {
    const { admin, agencyId } = auth.context;
    const propertyId = new URL(request.url).searchParams.get('property_id');
    if (!propertyId) return Response.json({ error: 'property_id lipsește' }, { status: 400 });
    const { data: property } = await admin.from('properties').select('*')
      .eq('id', propertyId).eq('agency_id', agencyId).is('deleted_at', null).maybeSingle();
    if (!property) return Response.json({ error: 'Proprietatea nu a fost găsită' }, { status: 404 });

    const { data: demands, error } = await admin.from('demands').select('*')
      .eq('agency_id', agencyId).eq('status', 'activa').eq('transaction', property.transaction)
      .contains('property_types', [property.category]).is('deleted_at', null).limit(1000);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    const scored = (demands || []).filter((demand) => isPropertySearchIntent(demand.intent))
      .map((demand) => ({ ...demand, ...scoreMatch(property, demand) }))
      .filter((demand) => demand.eligible && demand.score >= 30)
      .sort((a, b) => b.score - a.score).slice(0, 50);
    const contactIds = [...new Set(scored.map((demand) => demand.contact_id).filter(Boolean))];
    const { data: contacts } = contactIds.length > 0
      ? await admin.from('contacts').select('id, full_name, phone, email').eq('agency_id', agencyId).in('id', contactIds)
      : { data: [] as Array<{ id: string; full_name: string; phone?: string; email?: string }> };
    const contactsById = new Map((contacts || []).map((contact) => [contact.id, contact]));
    return Response.json({ matches: scored.map((demand) => {
      const contact = contactsById.get(demand.contact_id);
      return {
        ...demand,
        contact,
        contact_name: contact?.full_name || 'Client',
        contact_phone: contact?.phone || null,
        contact_email: contact?.email || null,
      };
    }) });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Eroare' }, { status: 500 });
  }
}
