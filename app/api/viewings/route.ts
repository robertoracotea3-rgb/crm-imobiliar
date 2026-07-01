export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

// Viewings are stored as calendar_events with type='vizionare' (so they show on the
// calendar automatically). The `status` / `outcome` columns are added by the migration.
const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_STATUS = ['programata', 'efectuata', 'anulata', 'amanata'];

// Detects "missing column" errors in either Postgres ("... does not exist")
// or PostgREST ("Could not find the 'X' column ... in the schema cache") wording.
const colMissing = (msg: string, col: string) =>
  msg.includes(col) && (msg.includes('schema cache') || msg.includes('does not exist') || msg.includes('column'));

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
  return { user, agency_id: profile.agency_id as string, role: profile.role as string };
}

// ── GET: list viewings (type='vizionare'), enriched with property titles ──
export async function GET(request: Request) {
  try {
    const { agency_id } = await auth(request);
    const { data, error } = await admin
      .from('calendar_events')
      .select('id, title, start_at, end_at, description, contact_name, contact_phone, contact_id, demand_id, lead_id, property_id, agent_id, completed, status, outcome')
      .eq('agency_id', agency_id)
      .eq('type', 'vizionare')
      .order('start_at', { ascending: false })
      .limit(300);

    if (error) {
      if (colMissing(error.message, 'status') || colMissing(error.message, 'outcome')) {
        return Response.json({ viewings: [], needsMigration: true });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }

    const events = data || [];
    const propIds = [...new Set(events.map(e => e.property_id).filter(Boolean))] as string[];
    let propMap: Record<string, { title: string; code: string }> = {};
    if (propIds.length) {
      const { data: props } = await admin.from('properties').select('id, title, internal_code').in('id', propIds);
      propMap = Object.fromEntries((props || []).map(p => [p.id, { title: p.title, code: p.internal_code }]));
    }

    const viewings = events.map(e => ({
      ...e,
      property_title: e.property_id ? propMap[e.property_id]?.title || null : null,
      property_code: e.property_id ? propMap[e.property_id]?.code || null : null,
    }));
    return Response.json({ viewings });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 401 });
  }
}

// ── POST: schedule a viewing ──
export async function POST(request: Request) {
  try {
    const { user, agency_id } = await auth(request);
    const body = await request.json();
    let { contact_name, contact_phone } = body;
    const { property_id, contact_id, demand_id, lead_id, start_at, description, agent_id, title } = body;
    if (!start_at) return Response.json({ error: 'Data și ora sunt obligatorii' }, { status: 400 });
    if (!property_id) return Response.json({ error: 'Selectează o proprietate' }, { status: 400 });
    if (!contact_id) return Response.json({ error: 'Selectează un contact (client)' }, { status: 400 });

    // Enrich client contact name/phone from the contacts table if not supplied.
    if (contact_id && (!contact_name || !contact_phone)) {
      const { data: ct } = await admin.from('contacts').select('full_name, phone').eq('id', contact_id).eq('agency_id', agency_id).single();
      if (ct) { contact_name = contact_name || ct.full_name; contact_phone = contact_phone || ct.phone; }
    }

    const insert: Record<string, unknown> = {
      agency_id,
      created_by: user.id,
      type: 'vizionare',
      title: title?.trim() || `Vizionare${contact_name ? ' — ' + contact_name : ''}`,
      start_at,
      description: description?.trim() || null,
      contact_name: contact_name?.trim?.() || contact_name || null,
      contact_phone: contact_phone?.trim?.() || contact_phone || null,
      contact_id: contact_id || null,
      property_id: property_id || null,
      demand_id: demand_id || null,
      lead_id: lead_id || null,
      agent_id: agent_id || user.id,
      status: 'programata',
      completed: false,
    };

    let { data, error } = await admin.from('calendar_events').insert(insert).select().single();
    // If demand_id / lead_id columns haven't been migrated yet, retry without them (keeps the viewing).
    if (error && colMissing(error.message, 'demand_id')) {
      delete insert.demand_id;
      ({ data, error } = await admin.from('calendar_events').insert(insert).select().single());
    }
    if (error && colMissing(error.message, 'lead_id')) {
      delete insert.lead_id;
      ({ data, error } = await admin.from('calendar_events').insert(insert).select().single());
    }
    if (error) {
      if (colMissing(error.message, 'status') || colMissing(error.message, 'outcome')) {
        return Response.json({ error: 'Lipsesc coloane în calendar_events — rulează migrarea SQL în Supabase (migrations/2026-features.sql).' }, { status: 503 });
      }
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ viewing: data }, { status: 201 });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

// ── PATCH: update a viewing (status / outcome / reschedule) ──
export async function PATCH(request: Request) {
  try {
    const { agency_id } = await auth(request);
    const body = await request.json();
    const { id, ...patch } = body;
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });

    const { data: ev } = await admin.from('calendar_events').select('id, agency_id').eq('id', id).single();
    if (!ev || ev.agency_id !== agency_id) return Response.json({ error: 'Acces interzis' }, { status: 403 });

    const allowed = ['status', 'outcome', 'start_at', 'description', 'contact_name', 'contact_phone', 'contact_id', 'demand_id', 'lead_id', 'property_id', 'agent_id'];
    const safe: Record<string, unknown> = {};
    for (const k of allowed) if (patch[k] !== undefined) safe[k] = patch[k];
    if (safe.status && !VALID_STATUS.includes(safe.status as string)) return Response.json({ error: 'Status invalid' }, { status: 400 });
    if (safe.status === 'efectuata') safe.completed = true;
    if (safe.status === 'programata' || safe.status === 'amanata') safe.completed = false;

    // If the client contact changed but name/phone weren't supplied, derive them.
    if (safe.contact_id && safe.contact_name === undefined) {
      const { data: ct } = await admin.from('contacts').select('full_name, phone').eq('id', safe.contact_id).eq('agency_id', agency_id).single();
      if (ct) { safe.contact_name = ct.full_name; safe.contact_phone = ct.phone; }
    }

    let { data, error } = await admin.from('calendar_events').update(safe).eq('id', id).select().single();
    if (error && colMissing(error.message, 'demand_id')) {
      delete safe.demand_id;
      ({ data, error } = await admin.from('calendar_events').update(safe).eq('id', id).select().single());
    }
    if (error && colMissing(error.message, 'lead_id')) {
      delete safe.lead_id;
      ({ data, error } = await admin.from('calendar_events').update(safe).eq('id', id).select().single());
    }
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ viewing: data });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

// ── DELETE: remove a viewing (?id=) ──
export async function DELETE(request: Request) {
  try {
    const { agency_id } = await auth(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });
    const { data: ev } = await admin.from('calendar_events').select('id, agency_id').eq('id', id).single();
    if (!ev || ev.agency_id !== agency_id) return Response.json({ error: 'Acces interzis' }, { status: 403 });
    const { error } = await admin.from('calendar_events').delete().eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
