export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Adaugă o notiță în istoricul (timeline) unui client.
export async function POST(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const { lead_id, note } = await request.json();
    if (!lead_id || !note?.trim()) return Response.json({ error: 'Notiță goală' }, { status: 400 });

    const { data: lead } = await admin.from('leads').select('id, agency_id').eq('id', lead_id).single();
    if (!lead) return Response.json({ error: 'Client negăsit' }, { status: 404 });
    if (lead.agency_id !== profile.agency_id) return Response.json({ error: 'Acces interzis' }, { status: 403 });

    const { data, error } = await admin.from('activities').insert({
      type: 'note', description: String(note).trim().slice(0, 1000), lead_id, user_id: user.id,
    }).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });

    return Response.json({ activity: data }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
