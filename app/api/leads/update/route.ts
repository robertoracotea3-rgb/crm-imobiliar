export const dynamic = 'force-dynamic';

import { statusLabel } from '@/lib/clients';
import {
  LEAD_STATUSES,
  LEAD_STATUS_TRANSITIONS,
  canTransition,
  getCatalogItem,
  isLeadStatus,
  normalizeLeadSource,
} from '@/lib/crm-catalogs';
import { requireApiAuth } from '@/lib/server/api-auth';

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
      next_action_at, next_action_type, status_reason, status_note, lost_to_competitor,
    } = body;

    if (!id) return Response.json({ error: 'ID lipsa' }, { status: 400 });
    if (status !== undefined && !isLeadStatus(status)) {
      return Response.json({ error: 'Status invalid' }, { status: 400 });
    }

    const { data: lead } = await admin
      .from('leads')
      .select('id, agency_id, contact_id, status, next_action_at, next_action_type, status_reason, status_note')
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!lead) return Response.json({ error: 'Clientul nu exista' }, { status: 404 });

    if (status && status !== lead.status) {
      if (!isLeadStatus(lead.status) || !canTransition(LEAD_STATUS_TRANSITIONS, lead.status, status)) {
        return Response.json({ error: `Tranziția ${statusLabel(lead.status)} → ${statusLabel(status)} nu este permisă` }, { status: 409 });
      }
      const meta = getCatalogItem(LEAD_STATUSES, status);
      const effectiveNextActionAt = next_action_at || lead.next_action_at;
      const effectiveNextActionType = next_action_type || lead.next_action_type;
      if (meta?.requiresNextAction && (!effectiveNextActionAt || !effectiveNextActionType)) {
        return Response.json({ error: 'Următoarea acțiune și data ei sunt obligatorii pentru un lead activ' }, { status: 400 });
      }
      const nextActionTime = new Date(effectiveNextActionAt || '').getTime();
      if (meta?.requiresNextAction && (!Number.isFinite(nextActionTime) || nextActionTime <= Date.now())) {
        return Response.json({ error: 'Data următoarei acțiuni trebuie să fie în viitor' }, { status: 400 });
      }
      if (status === 'lost' && (!String(status_reason || '').trim() || !String(status_note || '').trim())) {
        return Response.json({ error: 'Motivul și observația sunt obligatorii pentru un lead pierdut' }, { status: 400 });
      }
    }

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
    if (source !== undefined) {
      const normalizedSource = normalizeLeadSource(source);
      patch.source = normalizedSource;
      patch.source_normalized = normalizedSource;
    }
    if (agent_id !== undefined) patch.agent_id = agent_id || null;
    if (next_action_at !== undefined) patch.next_action_at = next_action_at || null;
    if (next_action_type !== undefined) patch.next_action_type = next_action_type || null;
    if (status_reason !== undefined) patch.status_reason = String(status_reason || '').trim() || null;
    if (status_note !== undefined) patch.status_note = String(status_note || '').trim() || null;
    if (lost_to_competitor !== undefined) patch.lost_to_competitor = String(lost_to_competitor || '').trim() || null;
    if (status === 'contacted') patch.first_response_at = new Date().toISOString();

    const { data, error } = await admin
      .from('leads')
      .update(patch)
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    if (lead.contact_id && (contact_name !== undefined || contact_phone !== undefined || contact_email !== undefined)) {
      const contactPatch: Record<string, unknown> = {};
      if (contact_name !== undefined) contactPatch.full_name = String(contact_name || '').trim();
      if (contact_phone !== undefined) contactPatch.phone = String(contact_phone || '').trim() || null;
      if (contact_email !== undefined) contactPatch.email = String(contact_email || '').trim() || null;
      const { error: contactError } = await admin
        .from('contacts')
        .update(contactPatch)
        .eq('id', lead.contact_id)
        .eq('agency_id', agencyId)
        .eq('merge_status', 'active')
        .is('deleted_at', null);
      if (contactError) {
        return Response.json({ error: 'Leadul a fost salvat, dar profilul clientului nu a putut fi sincronizat' }, { status: 409 });
      }
    }

    if (status && status !== lead.status) {
      try {
        await admin.from('activities').insert({
          agency_id: agencyId,
          type: 'status',
          title: 'Status schimbat',
          description: `Status schimbat in "${statusLabel(status)}"`,
          lead_id: id,
          contact_id: lead.contact_id,
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
