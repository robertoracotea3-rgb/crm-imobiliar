export const dynamic = 'force-dynamic';

import { contextCanManageAll, requireApiAuth, type AuthenticatedContext } from '@/lib/server/api-auth';

const VALID_TYPES = ['vizionare', 'preluare', 'cerere', 'intalnire', 'followup', 'task'];
async function validateRefs(
  { admin, agencyId }: AuthenticatedContext,
  refs: { agent_id?: string | null; contact_id?: string | null; property_id?: string | null },
): Promise<Response | null> {
  if (refs.agent_id) {
    const { data } = await admin
      .from('profiles')
      .select('user_id')
      .eq('user_id', refs.agent_id)
      .eq('agency_id', agencyId)
      .maybeSingle();
    if (!data) return Response.json({ error: 'Agent invalid pentru aceasta agentie' }, { status: 400 });
  }

  if (refs.contact_id) {
    const { data } = await admin
      .from('contacts')
      .select('id')
      .eq('id', refs.contact_id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!data) return Response.json({ error: 'Contact invalid pentru aceasta agentie' }, { status: 400 });
  }

  if (refs.property_id) {
    const { data } = await admin
      .from('properties')
      .select('id')
      .eq('id', refs.property_id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!data) return Response.json({ error: 'Proprietate invalida pentru aceasta agentie' }, { status: 400 });
  }

  return null;
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'calendar', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId, user } = auth.context;
    const url = new URL(request.url);
    const from = url.searchParams.get('from') || new Date(new Date().setDate(1)).toISOString().split('T')[0];
    const to = url.searchParams.get('to') || new Date(new Date().setMonth(new Date().getMonth() + 1, 0)).toISOString().split('T')[0];
    const requestedAgent = url.searchParams.get('agent_id') || '';
    const agentFilter = contextCanManageAll(auth.context, 'calendar') ? requestedAgent : user.id;

    let query = admin
      .from('calendar_events')
      .select('*')
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .gte('start_at', `${from}T00:00:00`)
      .lte('start_at', `${to}T23:59:59`)
      .order('start_at');

    if (agentFilter) query = query.eq('agent_id', agentFilter);

    const { data, error } = await query;
    if (error && error.code !== 'PGRST116') return Response.json({ events: [] });

    return Response.json({ events: data || [] });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'calendar', action: 'create' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId, user } = auth.context;
    const body = await request.json();
    const { title, type, start_at, end_at, description, contact_name, contact_phone, contact_id, property_id, agent_id, all_day, completed } = body;

    if (!title?.trim()) return Response.json({ error: 'Titlul este obligatoriu' }, { status: 400 });
    if (!start_at) return Response.json({ error: 'Data de start este obligatorie' }, { status: 400 });
    if (type && !VALID_TYPES.includes(type)) {
      return Response.json({ error: `Tip invalid. Permis: ${VALID_TYPES.join(', ')}` }, { status: 400 });
    }

    const finalAgentId = agent_id || user.id;
    const refsError = await validateRefs(auth.context, { agent_id: finalAgentId, contact_id, property_id });
    if (refsError) return refsError;

    const { data, error } = await admin.from('calendar_events').insert({
      agency_id: agencyId,
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
      agent_id: finalAgentId,
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
  const auth = await requireApiAuth(request, { module: 'calendar', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;
    const body = await request.json();
    const { id, ...patch } = body;
    if (!id) return Response.json({ error: 'ID lipsa' }, { status: 400 });

    const { data: ev } = await admin
      .from('calendar_events')
      .select('id')
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!ev) return Response.json({ error: 'Eveniment negasit' }, { status: 404 });

    const refsError = await validateRefs(auth.context, {
      agent_id: patch.agent_id,
      contact_id: patch.contact_id,
      property_id: patch.property_id,
    });
    if (refsError) return refsError;

    const allowed = ['title', 'type', 'start_at', 'end_at', 'description', 'contact_name', 'contact_phone', 'contact_id', 'property_id', 'agent_id', 'all_day', 'completed'];
    const safePatch: Record<string, unknown> = {};
    for (const k of allowed) if (patch[k] !== undefined) safePatch[k] = patch[k];
    if (safePatch.type && !VALID_TYPES.includes(safePatch.type as string)) return Response.json({ error: 'Tip invalid' }, { status: 400 });

    const { data, error } = await admin
      .from('calendar_events')
      .update(safePatch)
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ event: data });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(request, { module: 'calendar', action: 'delete' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId, user } = auth.context;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'ID lipsa' }, { status: 400 });

    const { data: ev } = await admin
      .from('calendar_events')
      .select('id')
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!ev) return Response.json({ error: 'Eveniment negasit' }, { status: 404 });

    const { error } = await admin
      .from('calendar_events')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
