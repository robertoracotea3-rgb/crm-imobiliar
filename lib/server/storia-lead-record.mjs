import { STORIA_CRM_PORTAL_ID, normalizePortalAdId } from './storia-ad-identity.mjs';

const optionalText = (value) => {
  const normalized = String(value ?? '').trim();
  return normalized || null;
};

export function buildAssociatedStoriaLeadRecord(input, context, transactionId, now = new Date()) {
  if (!context?.agencyId || !context?.propertyId || !transactionId) {
    throw new TypeError('agency, property and transaction are required');
  }

  const receivedAt = new Date(now);
  if (Number.isNaN(receivedAt.getTime())) throw new TypeError('received_at is invalid');

  const source = String(input?.from || '').toLowerCase().includes('olx') ? 'olx' : 'storia';
  const message = optionalText(input?.message);
  const conversationId = optionalText(input?.conversation_id);
  const trace = [
    `[${source}]`,
    conversationId ? `conv:${conversationId}` : null,
    message,
  ].filter(Boolean).join(' ');

  return {
    agency_id: context.agencyId,
    property_id: context.propertyId,
    property_title: optionalText(context.title),
    portal_id: STORIA_CRM_PORTAL_ID,
    portal_listing_id: optionalText(context.portalListingId),
    portal_ad_id: optionalText(context.portalAdId) || normalizePortalAdId(input?.ad_id),
    portal_conversation_id: conversationId,
    webhook_transaction_id: String(transactionId),
    contact_name: optionalText(input?.sender_name)
      || optionalText(input?.sender_email)
      || optionalText(input?.sender_phone)
      || 'Client Storia',
    contact_email: optionalText(input?.sender_email),
    contact_phone: optionalText(input?.sender_phone),
    message: trace,
    status: 'new',
    received_at: receivedAt.toISOString(),
    agent_id: optionalText(context.agentId),
    source,
    source_normalized: source,
    next_action_at: new Date(receivedAt.getTime() + 15 * 60 * 1_000).toISOString(),
    next_action_type: 'first_contact',
    association_status: 'linked',
    city: optionalText(context.city),
    county: optionalText(context.county),
    category: optionalText(context.category),
  };
}
