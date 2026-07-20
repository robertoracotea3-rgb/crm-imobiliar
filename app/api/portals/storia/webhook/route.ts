import { after, NextResponse } from 'next/server';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

import { getAdminClient } from '@/lib/server/api-auth';
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

const readPath = (obj: Record<string, unknown>, path: string): unknown => {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (!acc || typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, obj);
};

const asText = (value: unknown): string | undefined => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed || undefined;
  }
  if (typeof value === 'number') return String(value);
  return undefined;
};

const pickText = (obj: Record<string, unknown>, paths: string[]): string | undefined => {
  for (const path of paths) {
    const value = asText(readPath(obj, path));
    if (value) return value;
  }
  return undefined;
};

type PropertyContext = {
  agencyId: string;
  propertyId: string;
  portalId: string | null;
  agentId: string | null;
  city: string | null;
  county: string | null;
  category: string | null;
  title: string | null;
};

const isUuid = (value?: string) =>
  !!value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);

const uniqueTexts = (values: Array<string | undefined | null>) =>
  Array.from(new Set(values.map((v) => v?.trim()).filter(Boolean) as string[]));

const normalizeMatch = (value?: string | null) =>
  String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[șş]/g, 's')
    .replace(/[țţ]/g, 't')
    .replace(/[ăâ]/g, 'a')
    .replace(/î/g, 'i')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

async function propertyToContext(
  supabase: SupabaseClient,
  propertyId: string,
  portalId: string | null = null
): Promise<PropertyContext | null> {
  const { data: prop } = await supabase
    .from('properties')
    .select('id, agency_id, agent_id, city, county, category, title')
    .eq('id', propertyId)
    .is('deleted_at', null)
    .maybeSingle();

  if (!prop?.agency_id) return null;
  return {
    agencyId: prop.agency_id as string,
    propertyId: prop.id as string,
    portalId,
    agentId: (prop.agent_id as string | null) || null,
    city: (prop.city as string | null) || null,
    county: (prop.county as string | null) || null,
    category: (prop.category as string | null) || null,
    title: (prop.title as string | null) || null,
  };
}

async function listingToContext(
  supabase: SupabaseClient,
  listing: { id: string; property_id: string | null }
): Promise<PropertyContext | null> {
  if (!listing.property_id) return null;
  return propertyToContext(supabase, listing.property_id, listing.id);
}

async function resolvePropertyContext(
  supabase: SupabaseClient,
  args: {
    agencyId: string | null;
    adIds: string[];
    propertyIds: string[];
    adUrl?: string;
    propertyTitle?: string;
  }
): Promise<PropertyContext | null> {
  for (const propertyId of args.propertyIds.filter(isUuid)) {
    const ctx = await propertyToContext(supabase, propertyId);
    if (ctx && (!args.agencyId || ctx.agencyId === args.agencyId)) return ctx;
  }

  for (const adId of args.adIds) {
    const { data: listing } = await supabase
      .from('portal_listings')
      .select('id, property_id')
      .eq('portal', 'storia')
      .eq('external_id', adId)
      .maybeSingle();
    if (listing) {
      const ctx = await listingToContext(supabase, listing as { id: string; property_id: string | null });
      if (ctx && (!args.agencyId || ctx.agencyId === args.agencyId)) return ctx;
    }

    if (isUuid(adId)) {
      const ctx = await propertyToContext(supabase, adId);
      if (ctx && (!args.agencyId || ctx.agencyId === args.agencyId)) return ctx;
    }
  }

  if (args.adUrl) {
    const { data: listing } = await supabase
      .from('portal_listings')
      .select('id, property_id')
      .eq('portal', 'storia')
      .eq('advert_url', args.adUrl)
      .maybeSingle();
    if (listing) {
      const ctx = await listingToContext(supabase, listing as { id: string; property_id: string | null });
      if (ctx && (!args.agencyId || ctx.agencyId === args.agencyId)) return ctx;
    }
  }

  const titleNorm = normalizeMatch(args.propertyTitle);
  if (titleNorm && args.agencyId) {
    const { data: listings } = await supabase
      .from('portal_listings')
      .select('id, property_id')
      .eq('portal', 'storia')
      .eq('agency_id', args.agencyId)
      .limit(500);
    const propertyIds = uniqueTexts((listings || []).map((l) => l.property_id as string | null)).filter(isUuid);
    if (propertyIds.length) {
      const { data: props } = await supabase
        .from('properties')
        .select('id, agency_id, agent_id, city, county, category, title')
        .eq('agency_id', args.agencyId)
        .is('deleted_at', null)
        .in('id', propertyIds);
      const matches = (props || []).filter((p) => {
        const propTitle = normalizeMatch(p.title as string | null);
        return propTitle && (propTitle.includes(titleNorm) || titleNorm.includes(propTitle));
      });
      if (matches.length === 1) {
        const listing = (listings || []).find((l) => l.property_id === matches[0].id);
        return {
          agencyId: matches[0].agency_id as string,
          propertyId: matches[0].id as string,
          portalId: (listing?.id as string | null) || null,
          agentId: (matches[0].agent_id as string | null) || null,
          city: (matches[0].city as string | null) || null,
          county: (matches[0].county as string | null) || null,
          category: (matches[0].category as string | null) || null,
          title: (matches[0].title as string | null) || null,
        };
      }
    }
  }

  return null;
}

const normalizeIncomingLead = (
  payload: Record<string, unknown>,
  data: Record<string, unknown>
): Record<string, unknown> => {
  const merged: Record<string, unknown> = { ...payload, ...data };
  const messageValue = pickText(merged, [
    'message',
    'message.text',
    'message.content',
    'text',
    'content',
    'body',
    'description',
  ]);

  return {
    ad_id: pickText(merged, [
      'ad_id',
      'advert_id',
      'advertId',
      'object_id',
      'listing_id',
      'listingId',
      'ad.id',
      'advert.id',
      'advert.uuid',
      'advert.external_id',
      'listing.id',
      'listing.uuid',
      'listing.external_id',
      'conversation.advert_id',
      'conversation.advert.id',
      'conversation.listing_id',
      'data.advert_id',
      'data.object_id',
    ]),
    property_id: pickText(merged, [
      'property_id',
      'propertyId',
      'custom_fields.id',
      'customFields.id',
      'ad.custom_fields.id',
      'advert.custom_fields.id',
      'listing.custom_fields.id',
      'data.custom_fields.id',
      'conversation.advert.custom_fields.id',
      'conversation.listing.custom_fields.id',
    ]),
    ad_url: pickText(merged, [
      'ad_url',
      'advert_url',
      'listing_url',
      'url',
      'ad.url',
      'advert.url',
      'listing.url',
      'conversation.advert.url',
      'conversation.listing.url',
    ]),
    property_title: pickText(merged, [
      'property_title',
      'ad_title',
      'advert_title',
      'listing_title',
      'title',
      'ad.title',
      'advert.title',
      'listing.title',
      'conversation.advert.title',
      'conversation.listing.title',
    ]),
    conversation_id: pickText(merged, [
      'conversation_id',
      'conversationId',
      'conversation.id',
      'thread_id',
      'threadId',
      'message_thread_id',
      'messageThreadId',
    ]),
    sender_name: pickText(merged, [
      'sender_name',
      'senderName',
      'name',
      'sender.name',
      'user.name',
      'from.name',
      'contact.name',
      'author.name',
    ]),
    sender_email: pickText(merged, [
      'sender_email',
      'senderEmail',
      'email',
      'sender.email',
      'user.email',
      'from.email',
      'contact.email',
      'author.email',
    ]),
    sender_phone: pickText(merged, [
      'sender_phone',
      'senderPhone',
      'phone',
      'phone_number',
      'phoneNumber',
      'sender.phone',
      'sender.phone_number',
      'user.phone',
      'contact.phone',
      'author.phone',
    ]),
    message: messageValue,
    from: pickText(merged, ['from', 'source', 'portal']) || 'storia',
  };
};

async function handleIncomingLead(d: Record<string, unknown>): Promise<string | null> {
  const adId           = d.ad_id as string | undefined;
  const explicitPropertyId = d.property_id as string | undefined;
  const adUrl          = d.ad_url as string | undefined;
  const conversationId = d.conversation_id as string | undefined;
  const senderName     = d.sender_name  as string | undefined;
  const senderEmail    = d.sender_email as string | undefined;
  const senderPhone    = d.sender_phone as string | undefined;
  const message        = d.message      as string | undefined;
  const propertyTitle  = d.property_title as string | undefined;
  const from           = (d.from as string | undefined) || 'storia';

  if (!adId && !senderName && !message) return null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // Resolve agency_id + property_id from portal_listings
  let agencyId: string | null   = null;
  let propertyId: string | null = null;
  let portalId: string | null   = null;
  let propertyAgentId: string | null = null;
  let propertyCity: string | null = null;
  let propertyCounty: string | null = null;
  let propertyCategory: string | null = null;

  const resolvedProperty = await resolvePropertyContext(supabase, {
    agencyId: null,
    adIds: uniqueTexts([adId]),
    propertyIds: uniqueTexts([explicitPropertyId]),
    adUrl,
    propertyTitle,
  });

  if (resolvedProperty) {
    agencyId = resolvedProperty.agencyId;
    propertyId = resolvedProperty.propertyId;
    portalId = resolvedProperty.portalId;
    propertyAgentId = resolvedProperty.agentId;
    propertyCity = resolvedProperty.city;
    propertyCounty = resolvedProperty.county;
    propertyCategory = resolvedProperty.category;
  }

  if (!agencyId) {
    throw new Error('Webhook agency could not be resolved safely');
  }

  // Dedup: skip if same conversation already created a lead (match on portal_id + contact)
  // Use a 7-day window to avoid duplicates from repeated messages in same conversation.
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
  if (portalId && (senderPhone || senderEmail)) {
    let q = supabase
      .from('leads')
      .select('id')
      .eq('agency_id', agencyId)
      .eq('portal_id', portalId)
      .is('deleted_at', null)
      .gte('received_at', sevenDaysAgo);
    if (senderPhone) q = q.eq('contact_phone', senderPhone);
    else if (senderEmail) q = q.eq('contact_email', senderEmail);
    const { data: existing } = await q.maybeSingle();
    if (existing) {
      console.log('[Storia webhook] dedup — lead already exists for portal_id', portalId);
      return agencyId;
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

  // Dedup la nivel de persoană (telefon SAU email în aceeași agenție) —
  // nu creăm client duplicat, doar adăugăm solicitarea în istoricul lui.
  let existingId: string | null = null;
  if (conversationId) {
    const { data } = await supabase
      .from('leads')
      .select('id')
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .ilike('message', `%conv:${conversationId}%`)
      .limit(1);
    if (data?.[0]) existingId = data[0].id;
  }
  if (senderPhone) {
    const { data } = await supabase.from('leads').select('id').eq('agency_id', agencyId).eq('contact_phone', senderPhone).is('deleted_at', null).limit(1);
    if (data?.[0]) existingId = data[0].id;
  }
  if (!existingId && senderEmail) {
    const { data } = await supabase.from('leads').select('id').eq('agency_id', agencyId).eq('contact_email', senderEmail).is('deleted_at', null).limit(1);
    if (data?.[0]) existingId = data[0].id;
  }
  if (existingId) {
    if (propertyId) {
      try {
        const patch: Record<string, unknown> = {
          property_id: propertyId,
          city: propertyCity,
          county: propertyCounty,
          category: propertyCategory,
          source,
        };
        if (propertyAgentId) patch.agent_id = propertyAgentId;
        await supabase
          .from('leads')
          .update(patch)
          .eq('id', existingId)
          .eq('agency_id', agencyId)
          .is('deleted_at', null);
      } catch { /* best-effort */ }
    }
    try {
      await supabase.from('activities').insert({
        agency_id: agencyId,
        type: 'request',
        title: 'Solicitare nouă',
        description: `(${source})${message ? ': ' + message.slice(0, 300) : ''}`,
        lead_id: existingId,
      });
    } catch { /* tabela activities poate lipsi */ }
    console.log('[Storia webhook] dedup persoană — solicitare adăugată la clientul', existingId);
    return agencyId;
  }

  const { data: inserted } = await supabase.from('leads').insert({
    agency_id:    agencyId,
    property_id:  propertyId ?? null,
    contact_name:  senderName || senderEmail || senderPhone || 'Client Storia',
    contact_email: senderEmail ?? null,
    contact_phone: senderPhone ?? null,
    message:       fullMessage,
    status:        'new',
    received_at:   new Date().toISOString(),
  }).select('id').maybeSingle();

  // Enrich + auto-atribuire din proprietate (best-effort; sigur dacă lipsesc coloanele noi)
  if (inserted?.id) {
    try {
      const duplicateById = new Map<string, { id: string; received_at: string | null }>();
      const collect = (rows?: { id: string; received_at: string | null }[] | null) => {
        for (const row of rows || []) duplicateById.set(row.id, row);
      };
      if (senderPhone) {
        const { data } = await supabase
          .from('leads')
          .select('id, received_at')
          .eq('agency_id', agencyId)
          .eq('contact_phone', senderPhone)
          .is('deleted_at', null)
          .order('received_at', { ascending: true })
          .limit(5);
        collect(data);
      }
      if (senderEmail) {
        const { data } = await supabase
          .from('leads')
          .select('id, received_at')
          .eq('agency_id', agencyId)
          .eq('contact_email', senderEmail)
          .is('deleted_at', null)
          .order('received_at', { ascending: true })
          .limit(5);
        collect(data);
      }
      const primary = Array.from(duplicateById.values()).sort((a, b) => {
        const byDate = String(a.received_at || '').localeCompare(String(b.received_at || ''));
        return byDate || a.id.localeCompare(b.id);
      })[0];
      if (primary && primary.id !== inserted.id) {
        await supabase
          .from('leads')
          .update({ deleted_at: new Date().toISOString() })
          .eq('id', inserted.id)
          .eq('agency_id', agencyId);
        await supabase.from('activities').insert({
          agency_id: agencyId,
          type: 'request',
          title: 'Solicitare nouÄƒ',
          description: `(${source})${message ? ': ' + message.slice(0, 300) : ''}`,
          lead_id: primary.id,
        });
        console.log('[Storia webhook] duplicate merged into lead', primary.id);
        return agencyId;
      }
    } catch { /* deduplicarea post-inserare este best-effort */ }

    try {
      let agent: string | null = propertyAgentId;
      let city: string | null = propertyCity;
      let county: string | null = propertyCounty;
      let category: string | null = propertyCategory;
      if (propertyId && (!agent || !city || !county || !category)) {
        const { data: prop } = await supabase.from('properties').select('agent_id, city, county, category').eq('id', propertyId).eq('agency_id', agencyId).is('deleted_at', null).maybeSingle();
        agent = agent || prop?.agent_id || null;
        city = city || prop?.city || null;
        county = county || prop?.county || null;
        category = category || prop?.category || null;
      }
      if (!agent) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('user_id, role')
          .eq('agency_id', agencyId);
        const preferred = (profiles || []).find((p) => p.role === 'owner')
          || (profiles || []).find((p) => p.role === 'admin')
          || (profiles || [])[0];
        agent = preferred?.user_id || null;
      }
      await supabase.from('leads').update({ agent_id: agent, city, county, category, source }).eq('id', inserted.id);
    } catch { /* coloane noi pot lipsi încă — ignorăm */ }
    try {
      await supabase.from('activities').insert({
        agency_id: agencyId, type: 'created', title: 'Client creat',
        description: `Lead nou din ${source}`, lead_id: inserted.id,
      });
    } catch { /* tabela activities poate lipsi */ }
  }

  console.log('[Storia webhook] lead created', { propertyId, agencyId });
  return agencyId;
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
  const signature = request.headers.get(OLX_SIGNATURE_HEADER);
  const secret = process.env.STORIA_WEBHOOK_SECRET;
  const verification = verifyOlxWebhookSignature({
    signature,
    objectId,
    transactionId,
    secret,
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
      : verification.reason === 'missing_identifiers'
        ? 400
        : 401;
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

  if (reservation.duplicate) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const reservedEventId = reservation.eventId;

  after(async () => {
    try {
      await markWebhookEventProcessing(admin, reservedEventId);
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
    const normalizedLead = normalizeIncomingLead(p, d);
    const hasSender = !!normalizedLead.sender_name || !!normalizedLead.sender_phone || !!normalizedLead.sender_email;
    const hasMessage = !!normalizedLead.message;
    const looksLikeLead =
      evtType === 'incoming_message_success' ||
      flow === 'incoming_message' ||
      (!!hasMessage && (hasSender || !!normalizedLead.ad_id || !!normalizedLead.conversation_id));
    if (looksLikeLead) {
      const agencyId = await handleIncomingLead(normalizedLead);
      await markWebhookEventProcessed(admin, reservedEventId, agencyId);
      return;
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

    let statusAgencyId: string | null = null;
    if (externalId && newStatus) {
      const { data: listings, error: listingError } = await admin
        .from('portal_listings')
        .select('id, agency_id')
        .eq('external_id', externalId)
        .eq('portal', 'storia')
        .limit(2);

      if (listingError) throw new Error('Portal listing lookup failed');
      if ((listings || []).length > 1) {
        throw new Error('Ambiguous portal listing across agencies');
      }

      const listing = listings?.[0];
      if (listing) {
        statusAgencyId = listing.agency_id as string | null;
        const { error: updateError } = await admin
          .from('portal_listings')
          .update({
            status: newStatus,
            last_sync_at: new Date().toISOString(),
            error_message: errMsg,
            updated_at: new Date().toISOString(),
          })
          .eq('id', listing.id)
          .eq('agency_id', listing.agency_id)
          .eq('portal', 'storia');
        if (updateError) throw new Error('Portal listing status update failed');
      }
    }
      console.log('[Storia webhook]', event || eventType, externalId, newStatus);
      await markWebhookEventProcessed(admin, reservedEventId, statusAgencyId);
    } catch {
      await markWebhookEventFailed(admin, reservedEventId);
      console.error('[Storia webhook] verified event processing failed', {
        eventId: reservedEventId,
      });
    }
  });

  return NextResponse.json({ ok: true, accepted: true }, { status: 202 });
}
