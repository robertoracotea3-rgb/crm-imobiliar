export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Istoric (timeline) pentru un client — din tabela activities.
export async function GET(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'id lipsă' }, { status: 400 });

    const { data: lead } = await admin.from('leads').select('id, agency_id, received_at').eq('id', id).single();
    if (!lead) return Response.json({ error: 'Client negăsit' }, { status: 404 });
    if (lead.agency_id !== profile.agency_id) return Response.json({ error: 'Acces interzis' }, { status: 403 });

    let events: { type: string; description: string; created_at: string }[] = [];
    try {
      const { data } = await admin
        .from('activities')
        .select('type, description, created_at')
        .eq('lead_id', id)
        .order('created_at', { ascending: false });
      events = data || [];
    } catch { /* tabela activities poate lipsi */ }

    return Response.json({ events, received_at: lead.received_at });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
