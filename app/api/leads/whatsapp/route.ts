export const dynamic = 'force-dynamic';

import { requireApiAuth } from '@/lib/server/api-auth';
import { buildPublicPropertyUrl } from '@/lib/public-property-url';

const ACTIONS = ['opened', 'confirmed_sent', 'not_sent', 'unreachable'] as const;
type WhatsAppAction = typeof ACTIONS[number];

export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'leads', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { admin, serviceAdmin, agencyId, user } = auth.context;
  const body = await request.json().catch(() => ({}));
  const leadId = typeof body.lead_id === 'string' ? body.lead_id : '';
  const action = body.action as WhatsAppAction;

  if (!leadId || !ACTIONS.includes(action)) {
    return Response.json({ error: 'Acțiune WhatsApp invalidă' }, { status: 400 });
  }

  const { data: accessibleLead } = await admin
    .from('leads')
    .select('id')
    .eq('id', leadId)
    .eq('agency_id', agencyId)
    .maybeSingle();
  if (!accessibleLead) return Response.json({ error: 'Client negăsit' }, { status: 404 });

  let nextActionAt: string | null = null;
  if (['confirmed_sent', 'unreachable'].includes(action)) {
    const requested = body.next_action_at ? new Date(body.next_action_at) : new Date(Date.now() + 24 * 60 * 60 * 1000);
    if (Number.isNaN(requested.getTime()) || requested.getTime() <= Date.now()) {
      return Response.json({ error: 'Următoarea acțiune trebuie să fie în viitor' }, { status: 400 });
    }
    nextActionAt = requested.toISOString();
  }

  const { data, error } = await serviceAdmin.rpc('record_whatsapp_outcome', {
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
  let propertyShareWarning: string | null = null;
  if (action === 'confirmed_sent'
    && typeof body.property_id === 'string'
    && typeof body.share_idempotency_key === 'string') {
    const { data: property } = await admin.from('properties')
      .select('id,internal_code,title,category,city,attributes')
      .eq('id', body.property_id)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .maybeSingle();
    if (property) {
      const { error: shareError } = await serviceAdmin.rpc('crm_record_lead_property_share', {
        p_agency_id: agencyId,
        p_actor_id: user.id,
        p_lead_id: leadId,
        p_property_id: property.id,
        p_channel: 'whatsapp',
        p_public_url: buildPublicPropertyUrl(property),
        p_idempotency_key: body.share_idempotency_key,
      });
      if (shareError) {
        propertyShareWarning = 'Contactul a fost salvat, dar proprietatea trimisă nu a putut fi înregistrată în pipeline.';
      }
    } else {
      propertyShareWarning = 'Contactul a fost salvat, dar proprietatea nu mai este disponibilă în agenție.';
    }
  }
  return Response.json({ ...data, property_share_warning: propertyShareWarning });
}
