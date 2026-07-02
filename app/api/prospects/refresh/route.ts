export const dynamic = 'force-dynamic';
export const maxDuration = 60; // scraping mai multor surse poate dura

import { createClient } from '@supabase/supabase-js';
import { getSources } from '@/lib/prospects';
import { normalizePhone, type RawProspect } from '@/lib/prospects/types';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function auth(request: Request) {
  const token = request.headers.get('Authorization')?.replace('Bearer ', '');
  if (!token) throw new Error('Neautentificat');
  const { data: { user }, error } = await admin.auth.getUser(token);
  if (error || !user) throw new Error('Sesiune invalidă');
  const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
  if (!profile?.agency_id) throw new Error('Agenție negăsită');
  return { user, agency_id: profile.agency_id as string };
}

// POST — rulează sursele (on-demand), salvează/actualizează anunțurile de particulari.
// Body opțional: { sources: ['olx', ...] }. Fiecare sursă e izolată (o eroare pe una
// nu blochează restul). Dedup: upsert pe (agency_id, source, external_id).
export async function POST(request: Request) {
  try {
    const { agency_id } = await auth(request);
    const body = await request.json().catch(() => ({}));
    const keys = Array.isArray(body?.sources) ? (body.sources as string[]) : undefined;
    const sources = getSources(keys);
    const now = new Date().toISOString();

    const results: { source: string; label: string; count: number; error?: string }[] = [];
    let total = 0;

    for (const s of sources) {
      try {
        const raw: RawProspect[] = await s.fetchBrasov();
        // Nu suprascriem munca agentului (status/notiță/agent) — le omitem din upsert.
        const rows = raw.map((r) => ({
          agency_id,
          source: r.source,
          external_id: r.external_id,
          url: r.url,
          title: r.title || null,
          price: typeof r.price === 'number' ? r.price : null,
          currency: r.currency || 'EUR',
          category: r.category || null,
          transaction: r.transaction || null,
          city: r.city || null,
          zone: r.zone || null,
          phone: normalizePhone(r.phone) || null,
          seller_name: r.seller_name || null,
          posted_at: r.posted_at || null,
          last_seen_at: now,
        }));

        if (rows.length) {
          const { error } = await admin
            .from('prospects')
            .upsert(rows, { onConflict: 'agency_id,source,external_id' });
          if (error) throw new Error(error.message);
        }
        total += rows.length;
        results.push({ source: s.key, label: s.label, count: rows.length });
      } catch (e) {
        results.push({ source: s.key, label: s.label, count: 0, error: e instanceof Error ? e.message : 'eroare' });
      }
    }

    return Response.json({ ok: true, total, results });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 401 });
  }
}
