export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function POST(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin
      .from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const body = await request.json();
    const { contact_name, contact_phone, contact_email, message, property_id, source, agent_id } = body;

    if (!contact_name?.trim()) return Response.json({ error: 'Numele contactului este obligatoriu' }, { status: 400 });
    if (!contact_phone?.trim()) return Response.json({ error: 'Telefonul este obligatoriu' }, { status: 400 });

    // Tabela leads nu are coloane property_title/source — includem informația în mesaj
    let property_title: string | null = null;
    if (property_id) {
      const { data: prop } = await admin
        .from('properties').select('title').eq('id', property_id).eq('agency_id', profile.agency_id).single();
      property_title = prop?.title || null;
    }

    const fullMessage = [
      message?.trim() || '',
      property_title ? `— Proprietate: ${property_title}` : '',
      source ? `— Sursă: ${source}` : '',
    ].filter(Boolean).join('\n');

    const { data, error } = await admin.from('leads').insert({
      agency_id: profile.agency_id,
      contact_name: contact_name.trim(),
      contact_phone: contact_phone.trim(),
      contact_email: contact_email?.trim() || null,
      message: fullMessage,
      property_id: property_id || null,
      status: 'new',
      received_at: new Date().toISOString(),
    }).select().single();

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Auto-atribuire: agentul ales explicit, altfel agentul proprietății.
    // Best-effort: dacă tabela leads nu are încă coloana agent_id, ignorăm fără să stricăm crearea.
    try {
      let assignedAgent: string | null = (agent_id as string) || null;
      if (!assignedAgent && property_id) {
        const { data: prop } = await admin
          .from('properties').select('agent_id').eq('id', property_id).eq('agency_id', profile.agency_id).maybeSingle();
        assignedAgent = prop?.agent_id || null;
      }
      if (assignedAgent && data?.id) {
        await admin.from('leads').update({ agent_id: assignedAgent }).eq('id', data.id);
        (data as Record<string, unknown>).agent_id = assignedAgent;
      }
    } catch { /* coloana agent_id poate lipsi încă — ignorăm */ }

    return Response.json({ lead: data }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
