export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_TYPE = ['vanzare', 'inchiriere'];

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') return String((e as any).message || JSON.stringify(e));
  return String(e ?? 'Eroare');
}

const num = (v: unknown): number => {
  const n = parseFloat(String(v));
  return Number.isFinite(n) ? n : 0;
};

const migrationError = (msg: string) => /relation|does not exist|schema cache/i.test(msg);

async function auth(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) throw new Error('Neautentificat');
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new Error('Sesiune invalidă');
  const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
  if (!profile?.agency_id) throw new Error('Agenție negăsită');
  return { user, agency_id: profile.agency_id as string };
}

// ── GET: list transactions ──
export async function GET(request: Request) {
  try {
    const { agency_id } = await auth(request);
    const { data, error } = await admin
      .from('transactions')
      .select('id, property_id, agent_id, contact_id, type, sale_price, currency, agency_commission, agent_commission, closed_at, notes, created_at')
      .eq('agency_id', agency_id)
      .order('closed_at', { ascending: false, nullsFirst: false })
      .limit(500);

    if (error) {
      if (migrationError(error.message)) return Response.json({ transactions: [], needsMigration: true });
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ transactions: data || [] });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 401 });
  }
}

// ── POST: create a transaction ──
export async function POST(request: Request) {
  try {
    const { user, agency_id } = await auth(request);
    const b = await request.json();

    const { data, error } = await admin.from('transactions').insert({
      agency_id,
      created_by: user.id,
      property_id: b.property_id || null,
      agent_id: b.agent_id || user.id,
      contact_id: b.contact_id || null,
      type: VALID_TYPE.includes(b.type) ? b.type : 'vanzare',
      sale_price: num(b.sale_price),
      currency: b.currency || 'EUR',
      agency_commission: num(b.agency_commission),
      agent_commission: num(b.agent_commission),
      closed_at: b.closed_at || new Date().toISOString().slice(0, 10),
      notes: b.notes?.trim() || null,
    }).select().single();

    if (error) {
      if (migrationError(error.message)) return Response.json({ error: 'Tabela transactions lipsește — rulează migrarea SQL în Supabase.' }, { status: 503 });
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ transaction: data }, { status: 201 });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

// ── PATCH: update a transaction ──
export async function PATCH(request: Request) {
  try {
    const { agency_id } = await auth(request);
    const b = await request.json();
    const { id } = b;
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });

    const { data: existing } = await admin.from('transactions').select('id, agency_id').eq('id', id).single();
    if (!existing || existing.agency_id !== agency_id) return Response.json({ error: 'Acces interzis' }, { status: 403 });

    const safe: Record<string, unknown> = {};
    if (b.property_id !== undefined) safe.property_id = b.property_id || null;
    if (b.agent_id !== undefined) safe.agent_id = b.agent_id || null;
    if (b.contact_id !== undefined) safe.contact_id = b.contact_id || null;
    if (b.type !== undefined) safe.type = VALID_TYPE.includes(b.type) ? b.type : 'vanzare';
    if (b.sale_price !== undefined) safe.sale_price = num(b.sale_price);
    if (b.currency !== undefined) safe.currency = b.currency || 'EUR';
    if (b.agency_commission !== undefined) safe.agency_commission = num(b.agency_commission);
    if (b.agent_commission !== undefined) safe.agent_commission = num(b.agent_commission);
    if (b.closed_at !== undefined) safe.closed_at = b.closed_at || null;
    if (b.notes !== undefined) safe.notes = b.notes?.trim() || null;

    const { data, error } = await admin.from('transactions').update(safe).eq('id', id).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ transaction: data });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

// ── DELETE: remove a transaction (?id=) ──
export async function DELETE(request: Request) {
  try {
    const { agency_id } = await auth(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });

    const { data: existing } = await admin.from('transactions').select('id, agency_id').eq('id', id).single();
    if (!existing || existing.agency_id !== agency_id) return Response.json({ error: 'Acces interzis' }, { status: 403 });

    const { error } = await admin.from('transactions').delete().eq('id', id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
