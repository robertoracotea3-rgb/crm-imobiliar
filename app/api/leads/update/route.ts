export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import { statusLabel } from '@/lib/clients';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_STATUSES = [
  'new', 'contacted', 'viewing', 'negotiation', 'precontract', 'won', 'lost',
  'no_answer', 'to_send_offers', 'upcoming_viewing', 'in_progress', 'withdrawn',
  'replied', // legacy
];

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function PATCH(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin
      .from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const body = await request.json();
    const {
      id, status, contact_name, contact_phone, contact_email, message,
      city, county, category, transaction, budget_min, budget_max, currency, criteria, source, agent_id,
    } = body;

    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });
    if (status && !VALID_STATUSES.includes(status)) {
      return Response.json({ error: `Status invalid` }, { status: 400 });
    }

    const { data: lead } = await admin.from('leads').select('id, agency_id, status').eq('id', id).single();
    if (!lead) return Response.json({ error: 'Clientul nu există' }, { status: 404 });
    if (lead.agency_id !== profile.agency_id) return Response.json({ error: 'Acces interzis' }, { status: 403 });

    const patch: Record<string, unknown> = {};
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
    if (status === 'replied' || status === 'contacted') {
      patch.first_response_at = new Date().toISOString();
    }

    const { data, error } = await admin.from('leads').update(patch).eq('id', id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Timeline: notează schimbarea de status (best-effort)
    if (status && status !== lead.status) {
      try {
        await admin.from('activities').insert({
          agency_id: profile.agency_id,
          type: 'status',
          title: 'Status schimbat',
          description: `Status schimbat în „${statusLabel(status)}"`,
          lead_id: id,
          user_id: user.id,
        });
      } catch { /* tabela activities poate lipsi încă */ }
    }

    return Response.json({ lead: data });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
