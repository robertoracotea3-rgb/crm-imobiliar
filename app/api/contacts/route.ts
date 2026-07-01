export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

function errMsg(err: unknown): string {
  if (!err) return 'Eroare';
  if (err instanceof Error) return err.message;
  if (typeof err === 'object') {
    const o = err as Record<string, unknown>;
    return String(o.message || o.details || JSON.stringify(err));
  }
  return String(err);
}

// Schema reala DB: full_name, phone, phone_secondary, email, type (text[]), cnp, address, notes
// UI foloseste: name, phone, phone2, email, cnp, address, type (string), notes
interface DbContact {
  id: string;
  full_name: string;
  phone: string | null;
  phone_secondary: string | null;
  email: string | null;
  cnp: string | null;
  address: string | null;
  type: string[] | null;
  notes: string | null;
  created_at: string;
}

function toUi(c: DbContact) {
  return {
    id: c.id,
    name: c.full_name,
    phone: c.phone || '',
    phone2: c.phone_secondary || '',
    email: c.email || '',
    cnp: c.cnp || '',
    address: c.address || '',
    type: c.type?.[0] || 'proprietar',
    notes: c.notes || '',
    created_at: c.created_at,
  };
}

async function getAgencyId(token: string) {
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new Error('Sesiune invalida');
  const { data: profile } = await admin.from('profiles').select('agency_id, role').eq('user_id', user.id).single();
  if (!profile?.agency_id) throw new Error('Agentie negasita');
  return { user, agency_id: profile.agency_id, role: profile.role as string | null };
}

export async function GET(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });
    const { agency_id } = await getAgencyId(token);
    const { data, error } = await admin
      .from('contacts')
      .select('id, full_name, phone, phone_secondary, email, cnp, address, type, notes, created_at')
      .eq('agency_id', agency_id)
      .order('full_name')
      .limit(500);
    if (error) return Response.json({ error: errMsg(error), contacts: [] });
    return Response.json({ contacts: (data as DbContact[]).map(toUi) });
  } catch (err) {
    return Response.json({ error: errMsg(err), contacts: [] });
  }
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });
    const { user, agency_id } = await getAgencyId(token);
    const body = await request.json();
    const { name, phone, phone2, email, cnp, address, type, notes } = body;
    if (!name?.trim()) return Response.json({ error: 'Numele este obligatoriu' }, { status: 400 });

    const { data: contact, error } = await admin.from('contacts').insert([{
      agency_id,
      agent_id: user.id,
      created_by: user.id,
      full_name: name.trim(),
      phone: phone?.trim() || null,
      phone_secondary: phone2?.trim() || null,
      email: email?.trim() || null,
      cnp: cnp?.trim() || null,
      address: address?.trim() || null,
      type: [type || 'proprietar'],
      notes: notes?.trim() || null,
    }]).select('id, full_name, phone, phone_secondary, email, cnp, address, type, notes, created_at').single();

    if (error) return Response.json({ error: errMsg(error) }, { status: 500 });
    return Response.json({ contact: toUi(contact as DbContact) });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });
    const { user, agency_id } = await getAgencyId(token);
    void user;
    const body = await request.json();
    const { id, name, phone, phone2, email, cnp, address, type, notes } = body;
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });
    if (!name?.trim()) return Response.json({ error: 'Numele este obligatoriu' }, { status: 400 });

    const { data: contact, error } = await admin.from('contacts').update({
      full_name: name.trim(),
      phone: phone?.trim() || null,
      phone_secondary: phone2?.trim() || null,
      email: email?.trim() || null,
      cnp: cnp?.trim() || null,
      address: address?.trim() || null,
      type: [type || 'proprietar'],
      notes: notes?.trim() || null,
    })
      .eq('id', id)
      .eq('agency_id', agency_id)
      .select('id, full_name, phone, phone_secondary, email, cnp, address, type, notes, created_at')
      .single();

    if (error) return Response.json({ error: errMsg(error) }, { status: 500 });
    return Response.json({ contact: toUi(contact as DbContact) });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });
    const { user, agency_id, role } = await getAgencyId(token);
    void user;
    // Doar owner/admin pot șterge contacte (vezi DEFAULT_PERMISSIONS din lib/team-roles.ts).
    if (!['owner', 'admin'].includes(role || '')) {
      return Response.json({ error: 'Doar proprietarul sau administratorul poate șterge contacte' }, { status: 403 });
    }
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });

    const { error } = await admin.from('contacts')
      .delete()
      .eq('id', id)
      .eq('agency_id', agency_id);

    if (error) return Response.json({ error: errMsg(error) }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
