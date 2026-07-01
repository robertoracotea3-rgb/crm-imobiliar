export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_PRIORITY = ['mica', 'medie', 'mare'];
const VALID_STATUS = ['open', 'done'];

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') return String((e as any).message || JSON.stringify(e));
  return String(e ?? 'Eroare');
}

async function auth(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) throw new Error('Neautentificat');
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new Error('Sesiune invalidă');
  const { data: profile } = await admin.from('profiles').select('agency_id, role').eq('user_id', user.id).single();
  if (!profile?.agency_id) throw new Error('Agenție negăsită');
  return { user, agency_id: profile.agency_id as string, role: profile.role as string | null };
}

const migrationError = (msg: string) => /relation|does not exist/i.test(msg);

// ── GET: list tasks (optional ?status= & ?priority=) ──
export async function GET(request: Request) {
  try {
    const { agency_id } = await auth(request);
    const url = new URL(request.url);
    const status = url.searchParams.get('status');
    const priority = url.searchParams.get('priority');

    let q = admin.from('tasks')
      .select('id, title, description, priority, status, due_at, property_id, lead_id, assigned_to, created_by, completed_at, created_at')
      .eq('agency_id', agency_id);
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
    return Response.json({ error: errMsg(err) }, { status: 401 });
  }
}

// ── POST: create a task ──
export async function POST(request: Request) {
  try {
    const { user, agency_id } = await auth(request);
    const body = await request.json();
    const { title, description, priority, due_at, property_id, lead_id, assigned_to } = body;
    if (!title?.trim()) return Response.json({ error: 'Titlul este obligatoriu' }, { status: 400 });

    const { data, error } = await admin.from('tasks').insert({
      agency_id,
      created_by: user.id,
      assigned_to: assigned_to || user.id,
      title: title.trim(),
      description: description?.trim() || null,
      priority: VALID_PRIORITY.includes(priority) ? priority : 'medie',
      status: 'open',
      due_at: due_at || null,
      property_id: property_id || null,
      lead_id: lead_id || null,
    }).select().single();

    if (error) {
      if (migrationError(error.message)) return Response.json({ error: 'Tabela tasks lipsește — rulează migrarea SQL în Supabase.' }, { status: 503 });
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ task: data }, { status: 201 });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

// ── PATCH: update a task (toggle done, edit fields) ──
export async function PATCH(request: Request) {
  try {
    const { agency_id } = await auth(request);
    const body = await request.json();
    const { id, ...patch } = body;
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });

    const { data: existing } = await admin.from('tasks').select('id, agency_id').eq('id', id).single();
    if (!existing || existing.agency_id !== agency_id) return Response.json({ error: 'Acces interzis' }, { status: 403 });

    const allowed = ['title', 'description', 'priority', 'status', 'due_at', 'property_id', 'lead_id', 'assigned_to'];
    const safe: Record<string, unknown> = {};
    for (const k of allowed) if (patch[k] !== undefined) safe[k] = patch[k];
    if (safe.priority && !VALID_PRIORITY.includes(safe.priority as string)) return Response.json({ error: 'Prioritate invalidă' }, { status: 400 });
    if (safe.status && !VALID_STATUS.includes(safe.status as string)) return Response.json({ error: 'Status invalid' }, { status: 400 });
    if (safe.status === 'done') safe.completed_at = new Date().toISOString();
    if (safe.status === 'open') safe.completed_at = null;

    const { data, error } = await admin.from('tasks').update(safe).eq('id', id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ task: data });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

// ── DELETE: remove a task (?id=) ──
export async function DELETE(request: Request) {
  try {
    const { user, agency_id, role } = await auth(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });

    const { data: existing } = await admin.from('tasks').select('id, agency_id, created_by, assigned_to').eq('id', id).single();
    if (!existing || existing.agency_id !== agency_id) return Response.json({ error: 'Acces interzis' }, { status: 403 });

    // Owner/admin pot șterge orice task; ceilalți doar task-urile proprii (create de ei sau atribuite lor).
    const isManager = ['owner', 'admin'].includes(role || '');
    const isOwnTask = existing.created_by === user.id || existing.assigned_to === user.id;
    if (!isManager && !isOwnTask) {
      return Response.json({ error: 'Poți șterge doar task-urile tale' }, { status: 403 });
    }

    const { error } = await admin.from('tasks').delete().eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
