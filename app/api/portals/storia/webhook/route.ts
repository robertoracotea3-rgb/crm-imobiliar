import { after, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';

import { getAdminClient } from '@/lib/server/api-auth';
import {
  extractStoriaAdvertIdentity,
  STORIA_PORTAL_KEY,
} from '@/lib/server/storia-ad-identity.mjs';
import {
  ingestStoriaLead,
  type IncomingStoriaLead,
} from '@/lib/server/storia-leads';
import {
  hashWebhookPayload,
  OLX_SIGNATURE_HEADER,
  verifyOlxWebhookSignature,
} from '@/lib/server/storia-webhook-signature.mjs';
import {
  logRejectedWebhookEvent,
  markWebhookEventFailed,
  markWebhookEventProcessed,
  markWebhookEventProcessing,
  reserveWebhookEvent,
  type WebhookEnvelope,
} from '@/lib/server/storia-webhook-events';

const readPath = (obj: Record<string, unknown>, path: string): unknown => path
  .split('.')
  .reduce<unknown>((value, key) => {
    if (!value || typeof value !== 'object') return undefined;
    return (value as Record<string, unknown>)[key];
  }, obj);

const asText = (value: unknown): string | undefined => {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;
  return value.trim() || undefined;
};

const pickText = (obj: Record<string, unknown>, paths: string[]): string | undefined => {
  for (const path of paths) {
    const value = asText(readPath(obj, path));
    if (value) return value;
  }
  return undefined;
};

const isUuid = (value?: string | null) => (
  Boolean(value) && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value!)
);

function normalizeIncomingLead(
  payload: Record<string, unknown>,
  data: Record<string, unknown>,
): IncomingStoriaLead {
  const merged: Record<string, unknown> = { ...payload, ...data };
  return {
    // OLX documents data.ad_id as the public numeric advert identifier.
    ad_id: pickText(merged, [
      'ad_id', 'advert_id', 'advertId', 'ad.id', 'advert.id', 'listing.id',
      'conversation.advert_id', 'conversation.advert.id', 'conversation.listing_id',
    ]),
    external_id: pickText(merged, [
      'external_id', 'ad.uuid', 'advert.uuid', 'advert.external_id',
      'listing.uuid', 'listing.external_id', 'conversation.advert.uuid',
      'conversation.listing.uuid',
    ]),
    property_id: pickText(merged, [
      'property_id', 'propertyId', 'custom_fields.id', 'customFields.id',
      'ad.custom_fields.id', 'advert.custom_fields.id', 'listing.custom_fields.id',
      'conversation.advert.custom_fields.id', 'conversation.listing.custom_fields.id',
    ]),
    ad_url: pickText(merged, [
      'ad_url', 'advert_url', 'listing_url', 'url', 'ad.url', 'advert.url',
      'listing.url', 'conversation.advert.url', 'conversation.listing.url',
    ]),
    property_title: pickText(merged, [
      'property_title', 'ad_title', 'advert_title', 'listing_title', 'title',
      'ad.title', 'advert.title', 'listing.title', 'conversation.advert.title',
      'conversation.listing.title',
    ]),
    conversation_id: pickText(merged, [
      'conversation_id', 'conversationId', 'conversation.id', 'thread_id',
      'threadId', 'message_thread_id', 'messageThreadId',
    ]),
    sender_name: pickText(merged, [
      'sender_name', 'senderName', 'name', 'sender.name', 'user.name',
      'from.name', 'contact.name', 'author.name',
    ]),
    sender_email: pickText(merged, [
      'sender_email', 'senderEmail', 'email', 'sender.email', 'user.email',
      'from.email', 'contact.email', 'author.email',
    ]),
    sender_phone: pickText(merged, [
      'sender_phone', 'senderPhone', 'phone', 'phone_number', 'phoneNumber',
      'sender.phone', 'sender.phone_number', 'user.phone', 'contact.phone',
      'author.phone',
    ]),
    message: pickText(merged, [
      'message', 'message.text', 'message.content', 'text', 'content', 'body',
      'description',
    ]),
    from: pickText(merged, ['from', 'source', 'portal']) || 'storia',
  };
}

async function uniquePortalListing(
  admin: SupabaseClient,
  portalAdId?: string | null,
  externalId?: string | null,
) {
  const lookup = async (column: 'portal_ad_id' | 'external_id', value: string) => {
    const { data, error } = await admin
      .from('portal_listings')
      .select('id, agency_id')
      .eq('portal', STORIA_PORTAL_KEY)
      .eq(column, value)
      .limit(2);
    if (error) throw new Error(`Portal status lookup failed: ${column}`);
    if ((data || []).length > 1) throw new Error(`Ambiguous portal status lookup: ${column}`);
    return data?.[0] || null;
  };

  if (portalAdId) {
    const listing = await lookup('portal_ad_id', portalAdId);
    if (listing) return listing;
  }
  if (externalId) return lookup('external_id', externalId);
  return null;
}

function mapWebhookStatus(data: Record<string, unknown>): { status: string | null; error: string | null } {
  const eventType = asText(data.event_type);
  const isError = Boolean(eventType?.endsWith('_error'));
  const rawStatus = asText(data.status) || asText(data.last_action_status);
  let status: string | null = null;

  if (isError) status = 'error';
  else if (rawStatus) {
    const normalized = rawStatus.toUpperCase();
    status = ['POSTED', 'PUT', 'POST'].includes(normalized) ? 'active'
      : ['TO_POST', 'TO_PUT'].includes(normalized) ? 'pending'
        : normalized === 'NOT_POSTED' ? 'error'
          : normalized === 'REJECTED' ? 'rejected'
            : normalized.includes('DELETE') ? 'deleted'
              : rawStatus.toLowerCase();
  } else if (eventType) {
    status = /post|updat|activ/i.test(eventType) ? 'active'
      : /delet/i.test(eventType) ? 'deleted'
        : null;
  }

  const error = isError
    ? asText(data.error_message) || eventType || 'OLX error'
    : asText(data.reason) || null;
  return { status, error };
}

async function processVerifiedEvent(
  admin: SupabaseClient,
  payload: WebhookEnvelope,
  eventId: string,
  transactionId: string,
): Promise<void> {
  const root = payload as unknown as Record<string, unknown>;
  const data = (payload.data || {}) as Record<string, unknown>;
  const eventType = asText(root.event_type) || asText(data.event_type) || asText(root.event);
  const flow = asText(root.flow);
  const normalizedLead = normalizeIncomingLead(root, data);
  const hasSender = Boolean(
    normalizedLead.sender_name || normalizedLead.sender_phone || normalizedLead.sender_email,
  );
  const looksLikeLead = eventType === 'incoming_message_success'
    || flow === 'incoming_message'
    || Boolean(normalizedLead.message && (
      hasSender || normalizedLead.ad_id || normalizedLead.conversation_id
    ));

  if (looksLikeLead) {
    const result = await ingestStoriaLead(admin, normalizedLead, { eventId, transactionId });
    await markWebhookEventProcessed(admin, eventId, result.agencyId);
    return;
  }

  const identity = extractStoriaAdvertIdentity(data);
  const objectId = asText(data.object_id) || asText(root.object_id);
  const externalId = identity.externalId || (isUuid(objectId) ? objectId : null);
  const portalAdId = identity.portalAdId || (!isUuid(objectId) ? objectId : null);
  const mapped = mapWebhookStatus(data);
  let agencyId: string | null = null;

  if (mapped.status) {
    const listing = await uniquePortalListing(admin, portalAdId, externalId);
    if (listing) {
      agencyId = listing.agency_id as string;
      const { error } = await admin
        .from('portal_listings')
        .update({
          ...(portalAdId ? { portal_ad_id: portalAdId } : {}),
          ...(externalId ? { external_id: externalId } : {}),
          status: mapped.status,
          last_sync_at: new Date().toISOString(),
          error_message: mapped.error,
          updated_at: new Date().toISOString(),
        })
        .eq('id', listing.id)
        .eq('agency_id', listing.agency_id)
        .eq('portal', STORIA_PORTAL_KEY);
      if (error) throw new Error('Portal listing status update failed');
    }
  }

  await markWebhookEventProcessed(admin, eventId, agencyId);
}

export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  const raw = await request.text().catch(() => '');
  const payloadHash = hashWebhookPayload(raw);
  const admin = getAdminClient();
  let payload: WebhookEnvelope | null = null;

  try {
    payload = raw ? JSON.parse(raw) as WebhookEnvelope : null;
  } catch {
    await logRejectedWebhookEvent({ admin, payloadHash, reason: 'invalid_json' });
    return NextResponse.json({ ok: false, error: 'Invalid webhook payload' }, { status: 400 });
  }

  const transactionId = payload?.transaction_id;
  const objectId = payload?.object_id;
  const eventType = payload?.event_type || payload?.event;
  const flow = payload?.flow;
  const verification = verifyOlxWebhookSignature({
    signature: request.headers.get(OLX_SIGNATURE_HEADER),
    objectId,
    transactionId,
    secret: process.env.STORIA_WEBHOOK_SECRET,
  });

  if (!verification.ok || !payload || !transactionId || !objectId) {
    await logRejectedWebhookEvent({
      admin,
      payloadHash,
      reason: verification.reason || 'invalid_payload',
      transactionId,
      objectId,
      flow,
      eventType,
    });
    const status = verification.reason === 'missing_secret'
      ? 503
      : verification.reason === 'missing_identifiers' ? 400 : 401;
    return NextResponse.json({ ok: false, error: 'Webhook rejected' }, { status });
  }

  let reservation;
  try {
    reservation = await reserveWebhookEvent(admin, payload, payloadHash);
  } catch {
    return NextResponse.json({ ok: false, error: 'Webhook temporarily unavailable' }, { status: 503 });
  }

  if (reservation.payloadMismatch) {
    return NextResponse.json(
      { ok: false, error: 'Duplicate transaction payload mismatch' },
      { status: 409 },
    );
  }
  if (reservation.duplicate) return NextResponse.json({ ok: true, duplicate: true });

  const reservedEventId = reservation.eventId;
  after(async () => {
    try {
      await markWebhookEventProcessing(admin, reservedEventId);
      await processVerifiedEvent(admin, payload, reservedEventId, transactionId);
    } catch {
      await markWebhookEventFailed(admin, reservedEventId);
      console.error('[Storia webhook] verified event processing failed', {
        eventId: reservedEventId,
      });
    }
  });

  return NextResponse.json({ ok: true, accepted: true }, { status: 202 });
}
