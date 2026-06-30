export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';

const admin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') return String((e as Record<string, unknown>).message || JSON.stringify(e));
  return String(e || 'Eroare');
}

/**
 * Acțiuni în masă pe proprietăți.
 * Body: { ids: string[], agent_id?: string|null, publishSite?: boolean, unpublishSite?: boolean }
 * - agent_id  → mută proprietățile selectate pe alt agent (string) sau le dezatribuie (null/'')
 * - publishSite / unpublishSite → setează attributes.publicare.site
 */
export async function POST(request: Request) {
  try {
    const token = request.headers.get('Authorization')?.replace('Bearer ', '');
    if (!token) return Response.json({ error: 'Neautentificat' }, { status: 401 });

    const { data: { user }, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !user) return Response.json({ error: 'Sesiune invalidă' }, { status: 401 });

    const { data: profile } = await admin.from('profiles').select('agency_id').eq('user_id', user.id).single();
    if (!profile?.agency_id) return Response.json({ error: 'Agenție negăsită' }, { status: 400 });
    const agencyId = profile.agency_id;

    const body = await request.json();
    const { ids, agent_id, publishSite, unpublishSite } = body as {
      ids?: string[]; agent_id?: string | null; publishSite?: boolean; unpublishSite?: boolean;
    };

    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json({ error: 'Nicio proprietate selectată' }, { status: 400 });
    }

    // ── Mutare pe alt agent (update simplu de coloană, o singură interogare) ──
    if (agent_id !== undefined) {
      const { error } = await admin
        .from('properties')
        .update({ agent_id: agent_id || null, updated_at: new Date().toISOString() })
        .in('id', ids)
        .eq('agency_id', agencyId);
      if (error) return Response.json({ error: errMsg(error) }, { status: 500 });
    }

    // ── Publicare/retragere pe site (merge în attributes.publicare.site per rând) ──
    if (publishSite || unpublishSite) {
      const { data: rows } = await admin
        .from('properties')
        .select('id, attributes')
        .in('id', ids)
        .eq('agency_id', agencyId);

      await Promise.all((rows || []).map(r => {
        const attrs = (r.attributes as Record<string, unknown>) || {};
        const pub = (attrs.publicare as Record<string, unknown>) || {};
        return admin.from('properties').update({
          attributes: { ...attrs, publicare: { ...pub, site: !!publishSite } },
          updated_at: new Date().toISOString(),
        }).eq('id', r.id).eq('agency_id', agencyId);
      }));
    }

    return Response.json({ success: true, count: ids.length });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
