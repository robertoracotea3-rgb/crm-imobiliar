export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const VALID_STATUS = ['nou', 'contactat', 'refuzat', 'mandat'];

async function auth(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) throw new Error('Neautentificat');
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new Error('Sesiune invalidă');
  const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
  if (!profile?.agency_id) throw new Error('Agenție negăsită');
  return { user, agency_id: profile.agency_id as string };
}

// GET — listă anunțuri particulari, cu filtre (?status &source &category &city &q &phone=1)
export async function GET(request: Request) {
  try {
    const { agency_id } = await auth(request);
    const p = new URL(request.url).searchParams;

    // Construim query-ul de bază (cu filtre) de fiecare dată — se refolosește per bucată.
    const buildQuery = () => {
      let q = admin
        .from('prospects')
        .select('id, source, external_id, url, title, price, currency, category, transaction, city, zone, phone, seller_name, alt_sources, posted_at, status, assigned_to, notes, first_seen_at, last_seen_at')
        .eq('agency_id', agency_id);
      if (p.get('status')) q = q.eq('status', p.get('status'));
      if (p.get('source')) q = q.eq('source', p.get('source'));
      if (p.get('category')) q = q.eq('category', p.get('category'));
      if (p.get('city')) q = q.ilike('city', `%${p.get('city')}%`);
      if (p.get('phone') === '1') q = q.not('phone', 'is', null);
      if (p.get('q')) q = q.ilike('title', `%${p.get('q')}%`);
      return q.order('last_seen_at', { ascending: false });
    };

    // Supabase/PostgREST plafonează rezultatele la max-rows (implicit 1000) per
    // interogare — deci un simplu .limit(2000) tot întoarce max 1000. Paginăm cu
    // .range() în bucăți sub plafon ca să livrăm TOATE anunțurile (județul are ~1500+).
    const CHUNK = 500;
    const MAX = 8000;
    const all: Record<string, unknown>[] = [];
    for (let from = 0; from < MAX; from += CHUNK) {
      const { data, error } = await buildQuery().range(from, from + CHUNK - 1);
      if (error) {
        if (/relation|does not exist/i.test(error.message)) return Response.json({ prospects: [], needsMigration: true });
        return Response.json({ error: error.message }, { status: 500 });
      }
      if (!data || data.length === 0) break;
      all.push(...(data as Record<string, unknown>[]));
      if (data.length < CHUNK) break; // ultima bucată
    }
    return Response.json({ prospects: all });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 401 });
  }
}

// PATCH — actualizează status / notiță / agent alocat (munca agentului pe un anunț).
export async function PATCH(request: Request) {
  try {
    const { agency_id } = await auth(request);
    const body = await request.json();
    const { id, status, notes, assigned_to } = body;
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });
    if (status !== undefined && !VALID_STATUS.includes(status)) return Response.json({ error: 'Status invalid' }, { status: 400 });

    const patch: Record<string, unknown> = {};
    if (status !== undefined) patch.status = status;
    if (notes !== undefined) patch.notes = notes?.trim() || null;
    if (assigned_to !== undefined) patch.assigned_to = assigned_to || null;
    if (!Object.keys(patch).length) return Response.json({ error: 'Nimic de actualizat' }, { status: 400 });

    const { data, error } = await admin
      .from('prospects').update(patch).eq('id', id).eq('agency_id', agency_id)
      .select('id, status, notes, assigned_to').single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ prospect: data });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}

// DELETE — scoate un anunț din listă (?id=)
export async function DELETE(request: Request) {
  try {
    const { agency_id } = await auth(request);
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'ID lipsă' }, { status: 400 });
    const { error } = await admin.from('prospects').delete().eq('id', id).eq('agency_id', agency_id);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
