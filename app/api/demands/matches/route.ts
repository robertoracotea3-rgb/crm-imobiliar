export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

const STATUS_BY_ACTION = {
  review: 'revizuita',
  approve: 'aprobata',
  reject: 'respinsa',
} as const;

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'demands', action: 'edit' });
  if (!auth.ok) return auth.response;

  try {
    const { admin, serviceAdmin, agencyId, user } = auth.context;
    const { id, action, feedback } = await request.json() as { id?: string; action?: keyof typeof STATUS_BY_ACTION; feedback?: string };
    if (!id || !action || !STATUS_BY_ACTION[action]) {
      return Response.json({ error: 'Acțiune invalidă' }, { status: 400 });
    }
    const { data: accessible } = await admin.from('matches').select('id, demand_id')
      .eq('id', id).eq('agency_id', agencyId).maybeSingle();
    if (!accessible) return Response.json({ error: 'Potrivirea nu este accesibilă' }, { status: 404 });

    const patch: Record<string, unknown> = {
      status: STATUS_BY_ACTION[action],
      feedback: String(feedback || '').trim() || null,
      updated_at: new Date().toISOString(),
    };
    if (action === 'approve') {
      patch.agent_confirmed_at = new Date().toISOString();
      patch.agent_confirmed_by = user.id;
    }
    const { data, error } = await serviceAdmin.from('matches').update(patch)
      .eq('id', id).eq('agency_id', agencyId).select().single();
    if (error) return Response.json({ error: error.message }, { status: 500 });
    return Response.json({ match: data, client_message_sent: false });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : 'Eroare' }, { status: 500 });
  }
}
