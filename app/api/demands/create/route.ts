export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function generateCode(agencyId: string): Promise<string> {
  const { data } = await admin
    .from('demands')
    .select('internal_code')
    .eq('agency_id', agencyId)
    .like('internal_code', 'CE-%')
    .order('internal_code', { ascending: false })
    .limit(1);
  if (!data || data.length === 0) return 'CE-0001';
  const last = data[0].internal_code as string;
  const num = parseInt(last.replace('CE-', ''), 10) || 0;
  return `CE-${String(num + 1).padStart(4, '0')}`;
}

export async function POST(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userError } = await admin.auth.getUser(token);
    if (userError || !user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin
      .from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const body = await request.json();
    const c = body.criteria ?? {};

    const internal_code = await generateCode(profile.agency_id);

    const { error: insertError, data } = await admin.from('demands').insert([{
      internal_code,
      agency_id: profile.agency_id,
      agent_id: c.agent_id || null,
      contact_id: c.contact_id || null,
      category: body.category || null,
      transaction: c.tip_tranzactie || null,
      source: c.source || null,
      budget_min: body.min_price ?? null,
      budget_max: body.max_price ?? null,
      currency: c.currency || 'EUR',
      cities: c.city ? [c.city] : null,
      counties: c.county ? [c.county] : null,
      notes: c.notes || null,
      criteria: c,
    }]).select().single();

    if (insertError) return Response.json({ error: insertError.message }, { status: 500 });

    // Auto-create calendar activity for assigned agent
    if (data && c.agent_id) {
      try {
        let contactName = '';
        if (c.contact_id) {
          const { data: ct } = await admin.from('contacts').select('full_name').eq('id', c.contact_id).single();
          if (ct?.full_name) contactName = ct.full_name;
        }
        await admin.from('calendar_events').insert({
          agency_id: profile.agency_id,
          created_by: user.id,
          agent_id: c.agent_id,
          title: `Cerere nouă ${internal_code}${contactName ? ` — ${contactName}` : ''}`,
          type: 'cerere',
          start_at: new Date().toISOString(),
          all_day: false,
          completed: false,
          description: c.notes || null,
        });
      } catch {
        // Calendar insert failure should not block demand creation
      }
    }

    return Response.json({ demand: data });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
