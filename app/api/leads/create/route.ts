export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin
      .from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });
    const agencyId = profile.agency_id;

    const body = await request.json();
    const {
      contact_name, contact_phone, contact_email, message, property_id, source, agent_id,
      city, county, category, transaction, budget_min, budget_max, currency, criteria,
    } = body;

    if (!contact_name?.trim()) return Response.json({ error: 'Numele contactului este obligatoriu' }, { status: 400 });
    if (!contact_phone?.trim()) return Response.json({ error: 'Telefonul este obligatoriu' }, { status: 400 });

    const phone = String(contact_phone).trim();
    const email = contact_email?.trim() || null;

    // Derivă info din proprietatea legată (oraș/categorie/agent)
    let propCity: string | null = null, propCounty: string | null = null, propCategory: string | null = null, propAgent: string | null = null;
    if (property_id) {
      const { data: prop } = await admin
        .from('properties').select('city, county, category, agent_id').eq('id', property_id).eq('agency_id', agencyId).maybeSingle();
      propCity = prop?.city || null; propCounty = prop?.county || null;
      propCategory = prop?.category || null; propAgent = prop?.agent_id || null;
    }
    const finalCity = city || propCity || null;
    const finalCounty = county || propCounty || null;
    const finalCategory = category || propCategory || null;
    const assignedAgent = agent_id || propAgent || null;

    // ── Dedup: același telefon SAU email în aceeași agenție ──
    let existing: Record<string, unknown> | null = null;
    {
      const { data: byPhone } = await admin.from('leads').select('*').eq('agency_id', agencyId).eq('contact_phone', phone).limit(1);
      existing = byPhone?.[0] || null;
      if (!existing && email) {
        const { data: byEmail } = await admin.from('leads').select('*').eq('agency_id', agencyId).eq('contact_email', email).limit(1);
        existing = byEmail?.[0] || null;
      }
    }

    if (existing) {
      // Nu dublăm — completăm câmpurile lipsă și adăugăm solicitarea în istoric.
      const upd: Record<string, unknown> = {};
      if (!existing.property_id && property_id) upd.property_id = property_id;
      if (!existing.contact_email && email) upd.contact_email = email;
      try {
        if (!existing.city && finalCity) upd.city = finalCity;
        if (!existing.county && finalCounty) upd.county = finalCounty;
        if (!existing.category && finalCategory) upd.category = finalCategory;
        if (!existing.agent_id && assignedAgent) upd.agent_id = assignedAgent;
        if (!existing.source && source) upd.source = source;
      } catch { /* coloane noi pot lipsi */ }
      if (Object.keys(upd).length) { try { await admin.from('leads').update(upd).eq('id', existing.id); } catch { /* best-effort */ } }
      try {
        await admin.from('activities').insert({
          agency_id: agencyId,
          type: 'request',
          title: 'Solicitare nouă',
          description: message?.trim() ? String(message).trim().slice(0, 300) : null,
          lead_id: existing.id, user_id: user.id,
        });
      } catch { /* tabela activities poate lipsi */ }
      return Response.json({ lead: { ...existing, ...upd }, deduped: true }, { status: 200 });
    }

    // ── Client nou ──
    const { data, error } = await admin.from('leads').insert({
      agency_id: agencyId,
      contact_name: contact_name.trim(),
      contact_phone: phone,
      contact_email: email,
      message: message?.trim() || '',
      property_id: property_id || null,
      status: 'new',
      received_at: new Date().toISOString(),
    }).select().single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Completează coloanele noi (best-effort: sigur chiar dacă migrarea nu a fost rulată încă)
    try {
      const enrich = {
        source: source || null, city: finalCity, county: finalCounty, category: finalCategory,
        transaction: transaction || null, budget_min: num(budget_min), budget_max: num(budget_max),
        currency: currency || null, criteria: criteria || {}, agent_id: assignedAgent,
      };
      await admin.from('leads').update(enrich).eq('id', data.id);
      Object.assign(data, enrich);
    } catch { /* coloane noi pot lipsi încă */ }

    try {
      await admin.from('activities').insert({
        agency_id: agencyId, type: 'created', title: 'Client creat',
        description: 'Client adăugat în CRM', lead_id: data.id, user_id: user.id,
      });
    } catch { /* tabela activities poate lipsi */ }

    return Response.json({ lead: data }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
