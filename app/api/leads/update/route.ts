export const dynamic = 'force-dynamic';

import { statusLabel } from '@/lib/clients';
import { requireApiAuth } from '@/lib/server/api-auth';

const VALID_STATUSES = [
  'new', 'contacted', 'viewing', 'negotiation', 'precontract', 'won', 'lost',
  'no_answer', 'to_send_offers', 'upcoming_viewing', 'in_progress', 'withdrawn',
  'replied',
];

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'leads', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId, user } = auth.context;
    const body = await request.json();
    const {
      id, status, contact_name, contact_phone, contact_email, message,
      city, county, category, transaction, budget_min, budget_max, currency, criteria, source, agent_id, property_id,
    } = body;

    if (!id) return Response.json({ error: 'ID lipsa' }, { status: 400 });
    if (status && !VALID_STATUSES.includes(status)) {
      return Response.json({ error: 'Status invalid' }, { status: 400 });
    }

    const { data: lead } = await admin
      .from('leads')
      .select('id, agency_id, status')
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!lead) return Response.json({ error: 'Clientul nu exista' }, { status: 404 });

    if (agent_id && !(await agentBelongsToAgency(admin, agencyId, agent_id))) {
      return Response.json({ error: 'Agent invalid pentru aceasta agentie' }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (property_id !== undefined) {
      if (property_id) {
        const { data: property } = await admin
          .from('properties')
          .select('id, city, county, category, agent_id')
          .eq('id', property_id)
          .eq('agency_id', agencyId)
          .is('deleted_at', null)
          .maybeSingle();

        if (!property) return Response.json({ error: 'Proprietate negasita' }, { status: 404 });

        patch.property_id = property.id;
        patch.city = property.city || null;
        patch.county = property.county || null;
        patch.category = property.category || null;
        patch.agent_id = property.agent_id || null;
      } else {
        patch.property_id = null;
      }
    }
    if (status !== undefined) patch.status = status;
    if (contact_name !== undefined) patch.contact_name = contact_name;
    if (contact_phone !== undefined) patch.contact_phone = contact_phone;
    if (contact_email !== undefined) patch.contact_email = contact_email;
    if (message !== undefined) patch.message = message;
    if (city !== undefined) patch.city = city || null;
    if (county !== undefined) patch.county = county || null;
    if (category !== undefined) patch.category = category || null;
    if (transaction !== undefined) patch.transaction = transaction || null;
    if (budget_min !== undefined) patch.budget_min = num(budget_min);
    if (budget_max !== undefined) patch.budget_max = num(budget_max);
    if (currency !== undefined) patch.currency = currency || null;
    if (criteria !== undefined) patch.criteria = criteria || {};
    if (source !== undefined) patch.source = source || null;
    if (agent_id !== undefined) patch.agent_id = agent_id || null;
    if (status === 'replied' || status === 'contacted') patch.first_response_at = new Date().toISOString();

    const { data, error } = await admin
      .from('leads')
      .update(patch)
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    if (status && status !== lead.status) {
      try {
        await admin.from('activities').insert({
          agency_id: agencyId,
          type: 'status',
          title: 'Status schimbat',
          description: `Status schimbat in "${statusLabel(status)}"`,
          lead_id: id,
          user_id: user.id,
        });
      } catch {
        // Tabela de activitati poate lipsi in instalari vechi.
      }
    }

    return Response.json({ lead: data });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
