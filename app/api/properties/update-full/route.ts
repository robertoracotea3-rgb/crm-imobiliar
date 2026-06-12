export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(SUPABASE_URL, SERVICE_KEY);

function errMsg(e: unknown): string {
  if (!e) return 'Eroare';
  if (e instanceof Error) return e.message;
  if (typeof e === 'object') {
    const o = e as Record<string, unknown>;
    return String(o.message || o.details || JSON.stringify(e));
  }
  return String(e);
}

function num(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const body = await request.json();
    const { id, title, price, currency, description, county, city, zone, street, street_number, latitude, longitude, attributes } = body;

    if (!id || !title) return Response.json({ error: 'ID sau titlu lipsă' }, { status: 400 });

    const updateData: Record<string, unknown> = {
      title,
      price: num(price),
      currency: currency || 'EUR',
      description: description || null,
      county: county || null,
      city: city || null,
      zone: zone || null,
      street: street || null,
      street_number: street_number || null,
      latitude: num(latitude),
      longitude: num(longitude),
      attributes: attributes || {},
      updated_at: new Date().toISOString(),
    };

    const { error } = await admin
      .from('properties')
      .update(updateData)
      .eq('id', id)
      .eq('agency_id', profile.agency_id);

    if (error) return Response.json({ error: errMsg(error) }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
