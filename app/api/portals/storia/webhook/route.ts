import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

async function handleIncomingLead(d: Record<string, unknown>) {
  const adId           = d.ad_id as string | undefined;
  const conversationId = d.conversation_id as string | undefined;
  const senderName     = d.sender_name  as string | undefined;
  const senderEmail    = d.sender_email as string | undefined;
  const senderPhone    = d.sender_phone as string | undefined;
  const message        = d.message      as string | undefined;
  const from           = (d.from as string | undefined) || 'storia';

  if (!adId && !senderName && !message) return; // ignore empty pings

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Resolve agency_id + property_id from portal_listings
  let agencyId: string | null   = null;
  let propertyId: string | null = null;
  let portalId: string | null   = null;

  if (adId) {
    const { data: listing } = await supabase
      .from('portal_listings')
      .select('agency_id, property_id, id')
      .eq('external_id', adId)
      .eq('portal', 'storia')
      .maybeSingle();
    if (listing) {
      agencyId   = listing.agency_id;
      propertyId = listing.property_id;
      portalId   = listing.id;
    }
  }

  // Fallback: pick agency from the only (or first) agency in the system
  if (!agencyId) {
    const { data: agency } = await supabase
      .from('agencies')
      .select('id')
      .limit(1)
      .maybeSingle();
    agencyId = agency?.id ?? null;
  }

  if (!agencyId) {
    console.error('[Storia webhook] cannot resolve agency_id — lead dropped');
    return;
  }

  // Dedup: skip if same conversation already created a lead (match on portal_id + contact)
  // Use a 7-day window to avoid duplicates from repeated messages in same conversation.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (portalId && (senderPhone || senderEmail)) {
    let q = supabase
      .from('leads')
      .select('id')
      .eq('portal_id', portalId)
      .gte('received_at', sevenDaysAgo);
    if (senderPhone) q = q.eq('contact_phone', senderPhone);
    else if (senderEmail) q = q.eq('contact_email', senderEmail);
    const { data: existing } = await q.maybeSingle();
    if (existing) {
      console.log('[Storia webhook] dedup — lead already exists for portal_id', portalId);
      return;
    }
  }

  const source = from.includes('olx') ? 'OLX' : 'Storia';
  // Embed source + conversationId in message so it's always traceable
  const parts = [
    `[${source}]`,
    conversationId ? `conv:${conversationId}` : null,
    message || null,
  ].filter(Boolean);
  const fullMessage = parts.join(' ').trim();

  await supabase.from('leads').insert({
    agency_id:    agencyId,
    property_id:  propertyId ?? null,
    portal_id:    portalId   ?? null,
    contact_name:  senderName  ?? null,
    contact_email: senderEmail ?? null,
    contact_phone: senderPhone ?? null,
    message:       fullMessage,
    status:        'new',
    received_at:   new Date().toISOString(),
  });

  console.log('[Storia webhook] lead created for', senderName || senderEmail, 'property', propertyId);
}

// Webhook endpoint for OLX/Storia notifications.
// Registered in the Developer Hub. The "Test Callback" button there pings this URL
// and requires a 2xx response, so we ALWAYS return 200 (never 4xx/5xx) — that also
// follows webhook best practice: acknowledge receipt, then process asynchronously.

// GET — used by some availability checks / the Test Callback button.
export async function GET() {
  return NextResponse.json({ ok: true });
}

export async function POST(request: Request) {
  // Parse leniently — an empty/non-JSON body (e.g. the Test Callback ping) must still 200.
  const raw = await request.text().catch(() => '');
  let payload: { event?: string; data?: { id?: string; advert_id?: string; status?: string; reason?: string } } | null = null;
  try { payload = raw ? JSON.parse(raw) : null; } catch { payload = null; }

  // Nothing actionable (ping / test) → acknowledge.
  if (!payload || !payload.data) {
    return NextResponse.json({ ok: true });
  }

  // Signature check gates whether we TRUST the event — it never changes the 200 response.
  const signature = request.headers.get('x-olx-signature') || request.headers.get('x-olxgroup-signature');
  const secret    = process.env.STORIA_WEBHOOK_SECRET;
  let trusted = true;
  if (secret && signature) {
    try {
      const crypto = await import('crypto');
      const expected = crypto.createHmac('sha256', secret).update(raw).digest('hex');
      trusted = signature === expected;
    } catch {
      trusted = false;
    }
  }

  if (trusted) {
    const { event, data } = payload;
    const d = (data || {}) as Record<string, unknown>;

    // ── Incoming lead/message from a buyer (Storia) ─────────────────────────
    // OLX delivers buyer messages through this same webhook, with
    // event_type 'incoming_message_success' (flow 'incoming_message') and the
    // sender details inside `data`. Turn each new conversation into a CRM lead.
    // Docs: developer.olxgroup.com/docs/receiving-user-messages
    const p = payload as unknown as Record<string, unknown>;
    const evtType = (p.event_type || d.event_type) as string | undefined;
    const flow    = p.flow as string | undefined;
    const hasSender = !!d.sender_name || !!d.sender_phone || !!d.sender_email;
    if (evtType === 'incoming_message_success' || flow === 'incoming_message' || (!!d.message && hasSender)) {
      await handleIncomingLead(d);
      return NextResponse.json({ ok: true });
    }

    // OLX sends `id`/`advert_id` on some events, `object_id` on error/flow events.
    const externalId = (d.id || d.advert_id || d.object_id) as string | undefined;
    const eventType  = d.event_type as string | undefined;
    const isError    = eventType?.endsWith('_error') || false;
    // OLX may carry the new state as `status` or `last_action_status`
    // (POSTED / TO_POST / NOT_POSTED / REJECTED), or convey it only via event_type
    // (e.g. advert_posted, advert_put_error). Derive a canonical status from all of them.
    const rawStatus = (d.status || d.last_action_status) as string | undefined;
    let newStatus: string | null = null;
    if (isError) {
      newStatus = 'error';
    } else if (rawStatus) {
      // POSTED/PUT/POST = live; TO_POST/TO_PUT = queued (pending). See mapOlxStatus.
      const up = String(rawStatus).toUpperCase();
      newStatus = (up === 'POSTED' || up === 'PUT' || up === 'POST') ? 'active'
                : (up === 'TO_POST' || up === 'TO_PUT') ? 'pending'
                : up === 'NOT_POSTED'  ? 'error'
                : up === 'REJECTED'    ? 'rejected'
                : up.includes('DELETE') ? 'deleted'
                : String(rawStatus).toLowerCase();
    } else if (eventType) {
      // No explicit status field — infer from the event name.
      newStatus = /post|updat|activ/i.test(eventType) ? 'active'
                : /delet/i.test(eventType)            ? 'deleted'
                : null;
    }
    const errMsg = isError
      ? ((d.error_message as string) || eventType || 'OLX error')
      : ((d.reason as string) || null);

    if (externalId && newStatus) {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );
        await supabase.from('portal_listings')
          .update({
            status:        newStatus,
            last_sync_at:  new Date().toISOString(),
            error_message: errMsg,
            updated_at:    new Date().toISOString(),
          })
          .eq('external_id', externalId)
          .eq('portal', 'storia');
      } catch (e) {
        console.error('[Storia webhook] db update failed', e);
      }
    }
    console.log('[Storia webhook]', event || eventType, externalId, newStatus);
  } else {
    console.warn('[Storia webhook] untrusted signature — ignored event');
  }

  return NextResponse.json({ ok: true });
}
