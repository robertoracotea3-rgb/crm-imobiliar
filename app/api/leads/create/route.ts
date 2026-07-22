export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';
import { normalizeLeadSource } from '@/lib/crm-catalogs';

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function text(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null;
}

async function agentBelongsToAgency(admin: ReturnType<typeof import('@/lib/server/api-auth').getAdminClient>, agencyId: string, userId: string) {
  const { data } = await admin
    .from('profiles')
    .select('user_id')
    .eq('user_id', userId)
    .eq('agency_id', agencyId)
    .maybeSingle();

  return Boolean(data);
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'leads', action: 'create' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId, user } = auth.context;
    const body = await request.json();
    const {
      contact_name, contact_phone, contact_email, message, property_id, source, agent_id,
      city, county, category, transaction, budget_min, budget_max, currency, criteria,
    } = body;

    const contactName = text(contact_name);
    const phone = text(contact_phone);
    const email = text(contact_email);

    if (!contactName) return Response.json({ error: 'Numele contactului este obligatoriu' }, { status: 400 });
    if (!phone) return Response.json({ error: 'Telefonul este obligatoriu' }, { status: 400 });

    let propCity: string | null = null;
    let propCounty: string | null = null;
    let propCategory: string | null = null;
    let propAgent: string | null = null;

    if (property_id) {
      const { data: prop } = await admin
        .from('properties')
        .select('city, county, category, agent_id')
        .eq('id', property_id)
        .eq('agency_id', agencyId)
        .is('deleted_at', null)
        .maybeSingle();

      if (!prop) return Response.json({ error: 'Proprietate negasita' }, { status: 404 });

      propCity = prop.city || null;
      propCounty = prop.county || null;
      propCategory = prop.category || null;
      propAgent = prop.agent_id || null;
    }

    let assignedAgent = text(agent_id) || propAgent || null;
    if (assignedAgent && !(await agentBelongsToAgency(admin, agencyId, assignedAgent))) {
      return Response.json({ error: 'Agent invalid pentru aceasta agentie' }, { status: 400 });
    }

    const finalCity = text(city) || propCity || null;
    const finalCounty = text(county) || propCounty || null;
    const finalCategory = text(category) || propCategory || null;
    assignedAgent = assignedAgent || user.id;
    const normalizedSource = normalizeLeadSource(source) || 'manual';

    let existing: Record<string, unknown> | null = null;
    const { data: byPhone } = await admin
      .from('leads')
      .select('*')
      .eq('agency_id', agencyId)
      .eq('contact_phone', phone)
      .is('deleted_at', null)
      .limit(1);
    existing = byPhone?.[0] || null;

    if (!existing && email) {
      const { data: byEmail } = await admin
        .from('leads')
        .select('*')
        .eq('agency_id', agencyId)
        .eq('contact_email', email)
        .is('deleted_at', null)
        .limit(1);
      existing = byEmail?.[0] || null;
    }

    if (existing) {
      const upd: Record<string, unknown> = {};
      if (!existing.property_id && property_id) upd.property_id = property_id;
      if (!existing.contact_email && email) upd.contact_email = email;
      if (!existing.city && finalCity) upd.city = finalCity;
      if (!existing.county && finalCounty) upd.county = finalCounty;
      if (!existing.category && finalCategory) upd.category = finalCategory;
      if (!existing.agent_id && assignedAgent) upd.agent_id = assignedAgent;
      if (!existing.source) {
        upd.source = normalizedSource;
        upd.source_normalized = normalizedSource;
      }

      if (Object.keys(upd).length) {
        await admin
          .from('leads')
          .update(upd)
          .eq('id', existing.id)
          .eq('agency_id', agencyId)
          .is('deleted_at', null);
      }

      try {
        await admin.from('activities').insert({
          agency_id: agencyId,
          type: 'request',
          title: 'Solicitare noua',
          description: text(message)?.slice(0, 300) || null,
          lead_id: existing.id,
          user_id: user.id,
        });
      } catch {
        // Tabela de activitati poate lipsi in instalari vechi.
      }

      return Response.json({ lead: { ...existing, ...upd }, deduped: true }, { status: 200 });
    }

    const { data, error } = await admin.from('leads').insert({
      agency_id: agencyId,
      contact_name: contactName,
      contact_phone: phone,
      contact_email: email,
      message: text(message) || '',
      property_id: property_id || null,
      status: 'new',
      received_at: new Date().toISOString(),
      agent_id: assignedAgent,
      assigned_to: assignedAgent,
      source: normalizedSource,
      source_normalized: normalizedSource,
      next_action_at: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
      next_action_type: 'first_contact',
    }).select().single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    try {
      const enrich = {
        source: normalizedSource,
        source_normalized: normalizedSource,
        city: finalCity,
        county: finalCounty,
        category: finalCategory,
        transaction: transaction || null,
        budget_min: num(budget_min),
        budget_max: num(budget_max),
        currency: currency || null,
        criteria: criteria || {},
        agent_id: assignedAgent,
      };
      await admin.from('leads').update(enrich).eq('id', data.id).eq('agency_id', agencyId);
      Object.assign(data, enrich);
    } catch {
      // Coloanele noi pot lipsi in instalari vechi.
    }

    try {
      await admin.from('activities').insert({
        agency_id: agencyId,
        type: 'created',
        title: 'Client creat',
        description: 'Client adaugat in CRM',
        lead_id: data.id,
        user_id: user.id,
      });
    } catch {
      // Tabela de activitati poate lipsi in instalari vechi.
    }

    return Response.json({ lead: data }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
