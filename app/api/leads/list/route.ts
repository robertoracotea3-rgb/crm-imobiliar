export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';
import { buildPublicPropertyUrl } from '@/lib/public-property-url';

type PropertySummary = {
  id?: string | null;
  internal_code?: string | null;
  title?: string | null;
  city?: string | null;
  county?: string | null;
  category?: string | null;
  attributes?: Record<string, unknown> | null;
};

type ContactSummary = {
  id: string;
  full_name?: string | null;
  phone?: string | null;
  email?: string | null;
  agent_id?: string | null;
};

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'leads', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;

    const { data, error } = await admin
      .from('leads')
      .select('*')
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .order('received_at', { ascending: false })
      .limit(1000);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    const rows = data || [];
    const propIds = [...new Set(rows.map((l) => l.property_id).filter(Boolean))] as string[];
    let propById: Record<string, PropertySummary> = {};

    if (propIds.length) {
      const { data: props } = await admin
        .from('properties')
        .select('id, internal_code, title, city, county, category, attributes')
        .eq('agency_id', agencyId)
        .is('deleted_at', null)
        .in('id', propIds);

      propById = Object.fromEntries((props || []).map((p) => [p.id, p]));
    }

    const enrichedLeads = rows.map((l) => {
      const p = (l.property_id && propById[l.property_id]) || {};
      return {
        ...l,
        property_title: l.property_title || p.title || null,
        property_code: p.internal_code || null,
        property_public_url: p.id ? buildPublicPropertyUrl({
          id: p.id,
          internal_code: p.internal_code,
          category: p.category,
          city: p.city,
          attributes: p.attributes,
        }) : null,
        city: l.city || p.city || null,
        county: l.county || p.county || null,
        category: l.category || p.category || null,
      };
    });

    const contactIds = [...new Set(enrichedLeads.map((lead) => lead.contact_id).filter(Boolean))] as string[];
    const contactById: Record<string, ContactSummary> = {};
    const demandCountByContact = new Map<string, number>();
    if (contactIds.length) {
      const [{ data: contacts }, { data: demands }] = await Promise.all([
        admin.from('contacts')
          .select('id, full_name, phone, email, agent_id')
          .eq('agency_id', agencyId)
          .eq('merge_status', 'active')
          .is('deleted_at', null)
          .in('id', contactIds),
        admin.from('demands')
          .select('id, contact_id')
          .eq('agency_id', agencyId)
          .is('deleted_at', null)
          .in('contact_id', contactIds),
      ]);
      Object.assign(contactById, Object.fromEntries((contacts || []).map((contact) => [contact.id, contact])));
      for (const demand of demands || []) {
        if (demand.contact_id) demandCountByContact.set(
          demand.contact_id,
          (demandCountByContact.get(demand.contact_id) || 0) + 1,
        );
      }
    }

    // One visible card per canonical contact. The newest lead remains the
    // operational pipeline row, while all older leads stay in the profile.
    const groups = new Map<string, typeof enrichedLeads>();
    for (const lead of enrichedLeads) {
      const key = lead.contact_id ? `contact:${lead.contact_id}` : `lead:${lead.id}`;
      const group = groups.get(key) || [];
      group.push(lead);
      groups.set(key, group);
    }

    const leads = [...groups.values()].map((group) => {
      const primary = group[0];
      const contact = primary.contact_id ? contactById[primary.contact_id] : null;
      return {
        ...primary,
        contact_name: contact?.full_name || primary.contact_name,
        contact_phone: contact?.phone || primary.contact_phone,
        contact_email: contact?.email || primary.contact_email,
        agent_id: primary.agent_id || contact?.agent_id || null,
        lead_count: group.length,
        lead_ids: group.map((lead) => lead.id),
        demand_count: primary.contact_id ? (demandCountByContact.get(primary.contact_id) || 0) : 0,
        profile_available: Boolean(primary.contact_id && contact),
      };
    });

    return Response.json({ leads, totalProfiles: leads.length, totalLeads: enrichedLeads.length });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
