export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';

const ACTIONS = ['opened', 'confirmed_sent', 'not_sent', 'unreachable'] as const;
type WhatsAppAction = typeof ACTIONS[number];

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'leads', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { admin, agencyId, user } = auth.context;
  const body = await request.json().catch(() => ({}));
  const leadId = typeof body.lead_id === 'string' ? body.lead_id : '';
  const action = body.action as WhatsAppAction;

  if (!leadId || !ACTIONS.includes(action)) {
    return Response.json({ error: 'Acțiune WhatsApp invalidă' }, { status: 400 });
  }

  let nextActionAt: string | null = null;
  if (['confirmed_sent', 'unreachable'].includes(action)) {
    const requested = body.next_action_at ? new Date(body.next_action_at) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (Number.isNaN(requested.getTime()) || requested.getTime() <= Date.now()) {
      return Response.json({ error: 'Următoarea acțiune trebuie să fie în viitor' }, { status: 400 });
    }
    nextActionAt = requested.toISOString();
  }

  const { data, error } = await admin.rpc('record_whatsapp_outcome', {
    p_lead_id: leadId,
    p_agency_id: agencyId,
    p_user_id: user.id,
    p_action: action,
    p_next_action_at: nextActionAt,
  });

  if (error) {
    const status = error.message.includes('lead_not_found') ? 404 : 500;
    return Response.json({
      error: status === 404 ? 'Client negăsit' : 'Rezultatul contactării nu a putut fi salvat',
    }, { status });
  }
  return Response.json(data);
}
