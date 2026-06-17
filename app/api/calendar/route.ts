export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getAgency(token: string) {
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new Error('Sesiune invalida');
  const { data: profile } = await admin.from('profiles').select('agency_id, role').eq('user_id', user.id).single();
  if (!profile?.agency_id) throw new Error('Agentie negasita');
  return { user, agency_id: profile.agency_id, role: profile.role };
}

export async function GET(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });
    const { user, agency_id, role } = await getAgency(token);

    const url = new URL(request.url);
    const from = url.searchParams.get('from') || new Date(new Date().setDate(1)).toISOString().split('T')[0];
    const to = url.searchParams.get('to') || new Date(new Date().setMonth(new Date().getMonth() + 1, 0)).toISOString().split('T')[0];
    const requestedAgent = url.searchParams.get('agent_id') || '';

    // Owners can filter by any agent or see all; non-owners only see their own
    const agentFilter = role === 'owner' ? requestedAgent : user.id;

    let query = admin
      .from('calendar_events')
      .select('*')
      .eq('agency_id', agency_id)
      .gte('start_at', from + 'T00:00:00')
      .lte('start_at', to + 'T23:59:59')
      .order('start_at');

    if (agentFilter) query = query.eq('agent_id', agentFilter);

    const { data, error } = await query;

    if (error && error.code !== 'PGRST116') {
      return Response.json({ events: [] });
    }

    return Response.json({ events: data || [] });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });
    const { user, agency_id } = await getAgency(token);

    const body = await request.json();
    const { title, type, start_at, end_at, description, contact_name, contact_phone, contact_id, property_id, agent_id, all_day, completed } = body;

    if (!title?.trim()) return Response.json({ error: 'Titlul este obligatoriu' }, { status: 400 });
    if (!start_at) return Response.json({ error: 'Data de start este obligatorie' }, { status: 400 });

    const VALID_TYPES = ['vizionare', 'preluare', 'cerere', 'intalnire', 'followup', 'task'];
    if (type && !VALID_TYPES.includes(type)) {
      return Response.json({ error: `Tip invalid. Permis: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }

    const { data, error } = await admin.from('calendar_events').insert({
      agency_id,
      created_by: user.id,
      title: title.trim(),
      type: type || 'task',
      start_at,
      end_at: end_at || null,
      description: description?.trim() || null,
      contact_name: contact_name?.trim() || null,
      contact_phone: contact_phone?.trim() || null,
      contact_id: contact_id || null,
      property_id: property_id || null,
      agent_id: agent_id || user.id,
      all_day: all_day || false,
      completed: completed || false,
    }).select().single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ event: data }, { status: 201 });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });
    const { agency_id } = await getAgency(token);

    const body = await request.json();
    const { id, ...patch } = body;
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });

    const { data: ev } = await admin.from('calendar_events').select('id, agency_id').eq('id', id).single();
    if (!ev || ev.agency_id !== agency_id) return Response.json({ error: 'Acces interzis' }, { status: 403 });

    const allowed = ['title', 'type', 'start_at', 'end_at', 'description', 'contact_name', 'contact_phone', 'contact_id', 'property_id', 'agent_id', 'all_day', 'completed'];
    const safePatch: Record<string, unknown> = {};
    for (const k of allowed) {
      if (patch[k] !== undefined) safePatch[k] = patch[k];
    }

    const { data, error } = await admin.from('calendar_events').update(safePatch).eq('id', id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ event: data });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });
    const { agency_id } = await getAgency(token);

    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });

    const { data: ev } = await admin.from('calendar_events').select('id, agency_id').eq('id', id).single();
    if (!ev || ev.agency_id !== agency_id) return Response.json({ error: 'Acces interzis' }, { status: 403 });

    const { error } = await admin.from('calendar_events').delete().eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
