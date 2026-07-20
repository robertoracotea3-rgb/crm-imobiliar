export const dynamic = 'force-dynamic';
export const maxDuration = 90; // scraping mai multor surse (OLX + Publi24) poate dura

import { getSources } from '@/lib/prospects';
import { normalizePhone, type RawProspect } from '@/lib/prospects/types';
import { requireApiAuth } from '@/lib/server/api-auth';

// POST — rulează sursele (on-demand), salvează/actualizează anunțurile de particulari.
// Body opțional: { sources: ['olx', ...] }. Fiecare sursă e izolată (o eroare pe una
// nu blochează restul). Dedup: upsert pe (agency_id, source, external_id).
export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'prospects', action: 'create' });
  if (!auth.ok) return auth.response;
  try {
    const { serviceAdmin, agencyId: agency_id } = auth.context;
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
          const { error } = await serviceAdmin
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
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
