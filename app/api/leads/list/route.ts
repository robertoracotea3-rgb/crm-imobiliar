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

    const { data: { user } } = await admin.auth.getUser(token);
    if (!user) return Response.json({ error: 'Sesiune invalida' }, { status: 401 });

    const { data: profile } = await admin
      .from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agentie negasita' }, { status: 400 });

    const { data, error } = await admin
      .from('leads')
      .select('*')
      .eq('agency_id', profile.agency_id)
      .order('received_at', { ascending: false })
      .limit(200);

    if (error) return Response.json({ error: error.message }, { status: 500 });

    // Îmbogățire din proprietatea legată: titlu + fallback oraș/județ/categorie
    const rows = data || [];
    const propIds = [...new Set(rows.map((l) => l.property_id).filter(Boolean))] as string[];
    let propById: Record<string, { title?: string; city?: string; county?: string; category?: string }> = {};
    if (propIds.length) {
      const { data: props } = await admin.from('properties').select('id, title, city, county, category').in('id', propIds);
      propById = Object.fromEntries((props || []).map((p) => [p.id, p]));
    }
    const leads = rows.map((l) => {
      const p = (l.property_id && propById[l.property_id]) || {};
      return {
        ...l,
        property_title: l.property_title || p.title || null,
        city: l.city || p.city || null,
        county: l.county || p.county || null,
        category: l.category || p.category || null,
      };
    });

    return Response.json({ leads });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
