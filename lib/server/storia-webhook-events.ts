import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

export interface WebhookEnvelope {
  transaction_id: string;
  object_id: string;
  flow?: string;
  event_type?: string;
  event?: string;
  data?: Record<string, unknown>;
  [key: string]: unknown;
}

export interface ReservedWebhookEvent {
  eventId: string;
  duplicate: boolean;
  payloadMismatch: boolean;
  status: string;
}

type RejectedEventInput = {
  admin: SupabaseClient;
  payloadHash: string;
  reason: string;
  transactionId?: string | null;
  objectId?: string | null;
  flow?: string | null;
  eventType?: string | null;
};

const safeCode = (value: string) => value.replace(/[^a-z0-9_-]/gi, '_').slice(0, 80);

export async function logRejectedWebhookEvent(input: RejectedEventInput): Promise<void> {
  const { error } = await input.admin.from('webhook_events').insert({
    agency_id: null,
    portal: 'storia',
    transaction_id: input.transactionId || null,
    object_id: input.objectId || null,
    flow: input.flow || null,
    event_type: input.eventType || null,
    payload_hash: input.payloadHash,
    payload: null,
    signature_verified: false,
    processing_status: 'rejected',
    error_code: safeCode(input.reason),
    error_message: 'Webhook request rejected before processing',
  });

  if (error) {
    console.error('[Storia webhook] security event could not be persisted', {
      code: error.code || 'unknown',
    });
  }
}

export async function reserveWebhookEvent(
  admin: SupabaseClient,
  payload: WebhookEnvelope,
  payloadHash: string,
): Promise<ReservedWebhookEvent> {
  const { data, error } = await admin.rpc('reserve_webhook_event', {
    p_portal: 'storia',
    p_transaction_id: payload.transaction_id,
    p_object_id: payload.object_id,
    p_flow: payload.flow || null,
    p_event_type: payload.event_type || payload.event || null,
    p_payload_hash: payloadHash,
    p_payload: payload,
  });

  if (error) {
    console.error('[Storia webhook] event reservation failed', {
      code: error.code || 'unknown',
    });
    throw new Error('Webhook event could not be reserved');
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.event_id) throw new Error('Webhook reservation returned no event id');

  return {
    eventId: String(row.event_id),
    duplicate: Boolean(row.is_duplicate),
    payloadMismatch: Boolean(row.payload_mismatch),
    status: String(row.current_status || 'received'),
  };
}

export async function markWebhookEventProcessing(admin: SupabaseClient, eventId: string) {
  const { error } = await admin
    .from('webhook_events')
    .update({ processing_status: 'processing', processing_started_at: new Date().toISOString() })
    .eq('id', eventId)
    .eq('signature_verified', true);
  if (error) throw new Error('Could not mark webhook event as processing');
}

export async function markWebhookEventProcessed(
  admin: SupabaseClient,
  eventId: string,
  agencyId?: string | null,
) {
  const patch: Record<string, unknown> = {
    processing_status: 'processed',
    processed_at: new Date().toISOString(),
    error_code: null,
    error_message: null,
  };
  if (agencyId) patch.agency_id = agencyId;

  const { error } = await admin
    .from('webhook_events')
    .update(patch)
    .eq('id', eventId)
    .eq('signature_verified', true);
  if (error) throw new Error('Could not mark webhook event as processed');
}

export async function markWebhookEventFailed(admin: SupabaseClient, eventId: string) {
  const { error } = await admin
    .from('webhook_events')
    .update({
      processing_status: 'failed',
      processed_at: new Date().toISOString(),
      error_code: 'processing_failed',
      error_message: 'Verified webhook failed during processing',
    })
    .eq('id', eventId)
    .eq('signature_verified', true);
  if (error) {
    console.error('[Storia webhook] failed event state could not be persisted', {
      code: error.code || 'unknown',
    });
  }
}
