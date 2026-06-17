export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });
    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) return Response.json({ error: 'Sesiune invalidă' }, { status: 401 });
    const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agenție negăsită' }, { status: 400 });

    const propertyId = new URL(request.url).searchParams.get('property_id');
    if (!propertyId) return Response.json({ error: 'property_id lipsă' }, { status: 400 });

    const { data, error } = await admin
      .from('activity_logs')
      .select('id, action, field, old_value, new_value, user_name, created_at')
      .eq('agency_id', profile.agency_id)
      .eq('entity_type', 'property')
      .eq('entity_id', propertyId)
      .order('created_at', { ascending: false })
      .limit(100);

    if (error) {
      if (/relation|does not exist/i.test(error.message)) return Response.json({ logs: [], needsMigration: true });
      return Response.json({ error: error.message }, { status: 500 });
    }
    return Response.json({ logs: data || [] });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
