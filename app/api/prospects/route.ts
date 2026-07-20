export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

const VALID_STATUS = ['nou', 'contactat', 'refuzat', 'mandat'];

const normalizeText = (value: unknown) =>
  String(value ?? '')
    .replace(/È™/g, 'ș')
    .replace(/È›/g, 'ț')
    .replace(/È˜/g, 'ș')
    .replace(/Èš/g, 'ț')
    .replace(/Äƒ/g, 'ă')
    .replace(/Ä‚/g, 'ă')
    .replace(/Ã¢/g, 'â')
    .replace(/Ã‚/g, 'â')
    .replace(/Ã®/g, 'î')
    .replace(/ÃŽ/g, 'î')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[șş]/g, 's')
    .replace(/[țţ]/g, 't')
    .replace(/[ăâ]/g, 'a')
    .replace(/î/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const containsNormalized = (haystack: unknown, needle: string) => {
  if (!needle) return true;
  const normalizedHaystack = normalizeText(haystack);
  return normalizedHaystack.includes(needle) || needle.includes(normalizedHaystack);
};

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'prospects', action: 'view' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;
    const p = new URL(request.url).searchParams;

    const buildQuery = () => {
      let q = admin
        .from('prospects')
        .select('id, source, external_id, url, title, price, currency, category, transaction, city, zone, phone, seller_name, alt_sources, posted_at, status, assigned_to, notes, first_seen_at, last_seen_at')
        .eq('agency_id', agencyId)
        .is('deleted_at', null);
      if (p.get('status')) q = q.eq('status', p.get('status'));
      if (p.get('source')) q = q.eq('source', p.get('source'));
      if (p.get('category')) q = q.eq('category', p.get('category'));
      if (p.get('phone') === '1') q = q.not('phone', 'is', null);
      return q.order('last_seen_at', { ascending: false });
    };

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
      if (data.length < CHUNK) break;
    }

    const cityFilter = normalizeText(p.get('city'));
    const searchFilter = normalizeText(p.get('q'));
    const filtered = all.filter((row) => {
      if (cityFilter) {
        const location = [row.city, row.zone].filter(Boolean).join(' ');
        if (!containsNormalized(location, cityFilter)) return false;
      }
      if (searchFilter) {
        const searchable = [row.title, row.seller_name, row.city, row.zone, row.phone, row.source]
          .filter(Boolean)
          .join(' ');
        if (!containsNormalized(searchable, searchFilter)) return false;
      }
      return true;
    });

    return Response.json({ prospects: filtered });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'prospects', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;
    const body = await request.json();
    const { id, status, notes, assigned_to } = body;
    if (!id) return Response.json({ error: 'ID lipsa' }, { status: 400 });
    if (status !== undefined && !VALID_STATUS.includes(status)) return Response.json({ error: 'Status invalid' }, { status: 400 });

    if (assigned_to) {
      const { data: agent } = await admin.from('profiles').select('user_id').eq('user_id', assigned_to).eq('agency_id', agencyId).maybeSingle();
      if (!agent) return Response.json({ error: 'Agent invalid pentru aceasta agentie' }, { status: 400 });
    }

    const patch: Record<string, unknown> = {};
    if (status !== undefined) patch.status = status;
    if (notes !== undefined) patch.notes = notes?.trim() || null;
    if (assigned_to !== undefined) patch.assigned_to = assigned_to || null;
    if (!Object.keys(patch).length) return Response.json({ error: 'Nimic de actualizat' }, { status: 400 });

    const { data, error } = await admin
      .from('prospects')
      .update(patch)
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .select('id, status, notes, assigned_to')
      .single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ prospect: data });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireApiAuth(request, { module: 'prospects', action: 'delete' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId, user } = auth.context;
    const id = new URL(request.url).searchParams.get('id');
    if (!id) return Response.json({ error: 'ID lipsa' }, { status: 400 });
    const { error } = await admin
      .from('prospects')
      .update({ deleted_at: new Date().toISOString(), deleted_by: user.id })
      .eq('id', id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null);
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ success: true });
  } catch (err) {
    return Response.json({ error: err instanceof Error ? err.message : 'Eroare' }, { status: 500 });
  }
}
