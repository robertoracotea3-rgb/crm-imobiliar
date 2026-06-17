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

export async function GET(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const { data, error } = await admin
      .from('properties')
      .select('id, internal_code, title, city, county, zone, street, street_number, price, currency, category, created_at, updated_at, attributes, status, transaction, agent_id, owner_contact_id, latitude, longitude')
      .eq('agency_id', profile.agency_id)
      .order('created_at', { ascending: false })
      .limit(500);

    if (error) return Response.json({ error: errMsg(error) }, { status: 500 });
    return Response.json({ properties: data || [] });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
