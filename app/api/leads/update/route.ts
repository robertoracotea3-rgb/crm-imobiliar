export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_STATUSES = [
  // Pipeline kanban
  'new', 'contacted', 'viewing', 'negotiation', 'precontract', 'won', 'lost',
  // Backward-compatible legacy statuses
  'replied', 'in_progress',
];

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
    const { id, status, notes, contact_name, contact_phone, contact_email, message } = body;

    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });
    if (status && !VALID_STATUSES.includes(status)) {
      return Response.json({ error: `Status invalid. Permis: ${VALID_STATUSES.join(', ')}` }, { status: 400 });
    }

    // Verify ownership
    const { data: lead } = await admin.from('leads').select('id, agency_id').eq('id', id).single();
    if (!lead) return Response.json({ error: 'Lead-ul nu există' }, { status: 404 });
    if (lead.agency_id !== profile.agency_id) return Response.json({ error: 'Acces interzis' }, { status: 403 });

    const patch: Record<string, unknown> = {};
    if (status !== undefined) patch.status = status;
    if (notes !== undefined) patch.notes = notes;
    if (contact_name !== undefined) patch.contact_name = contact_name;
    if (contact_phone !== undefined) patch.contact_phone = contact_phone;
    if (contact_email !== undefined) patch.contact_email = contact_email;
    if (message !== undefined) patch.message = message;
    if (status === 'replied' || status === 'contacted') {
      patch.first_response_at = patch.first_response_at || new Date().toISOString();
    }

    const { data, error } = await admin.from('leads').update(patch).eq('id', id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ lead: data });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
