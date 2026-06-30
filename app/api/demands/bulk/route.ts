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
 * Acțiuni în masă pe cereri.
 * Body: { ids: string[], agent_id?: string|null }
 * - agent_id → atribuie cererile selectate unui agent (string) sau le dezatribuie (null/'')
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
    const { ids, agent_id } = body as { ids?: string[]; agent_id?: string | null };

    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json({ error: 'Nicio cerere selectată' }, { status: 400 });
    }
    if (agent_id === undefined) {
      return Response.json({ error: 'Lipsește agentul' }, { status: 400 });
    }

    const { error } = await admin
      .from('demands')
      .update({ agent_id: agent_id || null })
      .in('id', ids)
      .eq('agency_id', agencyId);

    if (error) return Response.json({ error: errMsg(error) }, { status: 500 });

    return Response.json({ success: true, count: ids.length });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
