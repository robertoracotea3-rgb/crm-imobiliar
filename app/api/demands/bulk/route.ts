export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object' && 'message' in e) return String(e.message);
  return String(e || 'Eroare');
}

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'demands', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, agencyId } = auth.context;
    const body = await request.json();
    const { ids, agent_id } = body as { ids?: string[]; agent_id?: string | null };

    if (!Array.isArray(ids) || ids.length === 0) {
      return Response.json({ error: 'Nicio cerere selectata' }, { status: 400 });
    }
    if (ids.length > 100) {
      return Response.json({ error: 'Maximum 100 cereri per actiune' }, { status: 400 });
    }
    if (agent_id === undefined) {
      return Response.json({ error: 'Lipseste agentul' }, { status: 400 });
    }

    if (agent_id) {
      const { data: agent } = await admin
        .from('profiles')
        .select('user_id')
        .eq('user_id', agent_id)
        .eq('agency_id', agencyId)
        .maybeSingle();

      if (!agent) return Response.json({ error: 'Agent invalid pentru aceasta agentie' }, { status: 400 });
    }

    const { error } = await admin
      .from('demands')
      .update({ agent_id: agent_id || null })
      .in('id', ids)
      .eq('agency_id', agencyId)
      .is('deleted_at', null);

    if (error) return Response.json({ error: errMsg(error) }, { status: 500 });

    return Response.json({ success: true, count: ids.length });
  } catch (err) {
    return Response.json({ error: errMsg(err) }, { status: 500 });
  }
}
