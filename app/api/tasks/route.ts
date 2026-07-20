export const dynamic = 'force-dynamic';

import { requireApiAuth, type AuthenticatedContext } from '@/lib/server/api-auth';

const VALID_PRIORITY = ['mica', 'medie', 'mare'];
const VALID_STATUS = ['open', 'done'];

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String(e.message);
  return String(e ?? 'Eroare');
}

const migrationError = (msg: string) => /relation|does not exist/i.test(msg);

async function validateRefs(
  { admin, agencyId }: AuthenticatedContext,
  refs: { assigned_to?: string | null; property_id?: string | null; lead_id?: string | null },
): Promise<Response | null> {
  if (refs.assigned_to) {
    const { data } = await admin
      .from('profiles')
      .select('user_id')
      .eq('user_id', refs.assigned_to)
      .eq('agency_id', agencyId)
      .maybeSingle();
    if (!data) return Response.json({ error: 'Agent invalid pentru aceasta agentie' }, { status: 400 });
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

  if (refs.lead_id) {
    const { data } = await admin
      .from('leads')
      .select('id')
      .eq('id', refs.lead_id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!data) return Response.json({ error: 'Lead invalid pentru aceasta agentie' }, { status: 400 });
  }

  return null;
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'tasks', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const priority = url.searchParams.get('priority');

    let q = admin.from('tasks')
      .select('id, title, description, priority, status, due_at, property_id, lead_id, assigned_to, created_by, completed_at, created_at')
      .eq('agency_id', agencyId)
      .is('deleted_at', null);
    if (status) q = q.eq('status', status);
    if (priority) q = q.eq('priority', priority);
    q = q.order('status', { ascending: true }).order('due_at', { ascending: true, nullsFirst: false });

    const { data, error } = await q;
    if (error) {
      if (migrationError(error.message)) return Response.json({ tasks: [], needsMigration: true });
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ tasks: data || [] });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'tasks', action: 'create' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId, user } = auth.context;
    const body = await request.json();
    const { title, description, priority, due_at, property_id, lead_id, assigned_to } = body;
    if (!title?.trim()) return Response.json({ error: 'Titlul este obligatoriu' }, { status: 400 });

    const finalAssignedTo = assigned_to || user.id;
    const refsError = await validateRefs(auth.context, { assigned_to: finalAssignedTo, property_id, lead_id });
    if (refsError) return refsError;

    const { data, error } = await admin.from('tasks').insert({
      agency_id: agencyId,
      created_by: user.id,
      assigned_to: finalAssignedTo,
      title: title.trim(),
      description: description?.trim() || null,
      priority: VALID_PRIORITY.includes(priority) ? priority : 'medie',
      status: 'open',
      due_at: due_at || null,
      property_id: property_id || null,
      lead_id: lead_id || null,
    }).select().single();

    if (error) {
      if (migrationError(error.message)) return Response.json({ error: 'Tabela tasks lipseste - ruleaza migrarea SQL in Supabase.' }, { status: 503 });
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ task: data }, { status: 201 });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'tasks', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;
    const body = await request.json();
    const { id, ...patch } = body;
    if (!id) return Response.json({ error: 'ID lipsa' }, { status: 400 });

    const { data: existing } = await admin
      .from('tasks')
      .select('id')
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!existing) return Response.json({ error: 'Task negasit' }, { status: 404 });

    const refsError = await validateRefs(auth.context, {
      assigned_to: patch.assigned_to,
      property_id: patch.property_id,
      lead_id: patch.lead_id,
    });
    if (refsError) return refsError;

    const allowed = ['title', 'description', 'priority', 'status', 'due_at', 'property_id', 'lead_id', 'assigned_to'];
    const safe: Record<string, unknown> = {};
    for (const k of allowed) if (patch[k] !== undefined) safe[k] = patch[k];
    if (safe.priority && !VALID_PRIORITY.includes(safe.priority as string)) return Response.json({ error: 'Prioritate invalida' }, { status: 400 });
    if (safe.status && !VALID_STATUS.includes(safe.status as string)) return Response.json({ error: 'Status invalid' }, { status: 400 });
    if (safe.status === 'done') safe.completed_at = new Date().toISOString();
    if (safe.status === 'open') safe.completed_at = null;

    const { data, error } = await admin
      .from('tasks')
      .update(safe)
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .select()
      .single();

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ task: data });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(request, { module: 'tasks', action: 'delete' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId, user } = auth.context;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'ID lipsa' }, { status: 400 });

    const { data: existing } = await admin
      .from('tasks')
      .select('id, created_by, assigned_to')
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (!existing) return Response.json({ error: 'Task negasit' }, { status: 404 });

    const { error } = await admin
      .from('tasks')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null);

    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
