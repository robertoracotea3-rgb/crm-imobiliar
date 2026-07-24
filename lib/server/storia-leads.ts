import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  STORIA_CRM_PORTAL_ID,
  STORIA_PORTAL_KEY,
  buildStoriaAdvertLookupPlan,
  normalizePortalAdId,
} from '@/lib/server/storia-ad-identity.mjs';
import { buildAssociatedStoriaLeadRecord } from '@/lib/server/storia-lead-record.mjs';
import { buildPublicPropertyUrl } from '@/lib/public-property-url';

export type IncomingStoriaLead = {
  ad_id?: string;
  external_id?: string;
  property_id?: string;
  ad_url?: string;
  property_title?: string;
  conversation_id?: string;
  sender_name?: string;
  sender_email?: string;
  sender_phone?: string;
  message?: string;
  from?: string;
};

export type StoriaPropertyContext = {
  agencyId: string;
  propertyId: string;
  portalListingId: string | null;
  portalAdId: string | null;
  externalId: string | null;
  responsibleAgentId: string | null;
  city: string | null;
  county: string | null;
  category: string | null;
  title: string | null;
  publicCode: string | null;
  publicUrl: string | null;
  mainPhotoUrl: string | null;
  price: number | null;
  currency: string | null;
};

type ListingRow = {
  id: string;
  agency_id: string;
  property_id: string | null;
  portal_ad_id: string | null;
  external_id: string | null;
};

export type AssociationResult =
  | { context: StoriaPropertyContext; reason: null; agencyId: string }
  | { context: null; reason: string; agencyId: string | null };

export type LeadIngestResult = {
  outcome: 'created' | 'updated' | 'unmatched';
  agencyId: string | null;
  leadId: string | null;
};

const isUuid = (value?: string | null) => (
  Boolean(value) && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value!)
);

async function propertyToContext(
  admin: SupabaseClient,
  propertyId: string,
  agencyId?: string | null,
  listing?: ListingRow | null,
): Promise<StoriaPropertyContext | null> {
  let query = admin
    .from('properties')
    .select('id, agency_id, agent_id, responsible_agent_id, internal_code, city, county, category, title, price, currency, attributes')
    .eq('id', propertyId)
    .is('deleted_at', null);
  if (agencyId) query = query.eq('agency_id', agencyId);

  const { data, error } = await query.maybeSingle();
  if (error) throw new Error('Property lookup failed');
  if (!data?.agency_id) return null;

  const { data: coverPhoto, error: coverError } = await admin
    .from('property_photos')
    .select('public_url')
    .eq('agency_id', data.agency_id)
    .eq('property_id', data.id)
    .is('deleted_at', null)
    .not('public_url', 'is', null)
    .order('is_cover', { ascending: false })
    .order('sort_order', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (coverError) throw new Error('Property cover photo lookup failed');

  const attributes = (data.attributes && typeof data.attributes === 'object')
    ? data.attributes as Record<string, unknown>
    : null;
  const fallbackPhotos = Array.isArray(attributes?.photos)
    ? attributes.photos.filter((value): value is string => typeof value === 'string')
    : [];
  const responsibleAgentId = (data.responsible_agent_id as string | null)
    || (data.agent_id as string | null)
    || null;

  return {
    agencyId: data.agency_id as string,
    propertyId: data.id as string,
    portalListingId: listing?.id || null,
    portalAdId: listing?.portal_ad_id || null,
    externalId: listing?.external_id || null,
    responsibleAgentId,
    city: (data.city as string | null) || null,
    county: (data.county as string | null) || null,
    category: (data.category as string | null) || null,
    title: (data.title as string | null) || null,
    publicCode: (data.internal_code as string | null) || null,
    publicUrl: buildPublicPropertyUrl({
      id: data.id as string,
      internal_code: (data.internal_code as string | null) || null,
      category: (data.category as string | null) || null,
      city: (data.city as string | null) || null,
      attributes,
    }),
    mainPhotoUrl: (coverPhoto?.public_url as string | null) || fallbackPhotos[0] || null,
    price: data.price === null || data.price === undefined ? null : Number(data.price),
    currency: (data.currency as string | null) || null,
  };
}

async function uniqueListing(
  admin: SupabaseClient,
  column: 'portal_ad_id' | 'external_id' | 'advert_url',
  value: string,
  agencyId?: string | null,
): Promise<{ listing: ListingRow | null; reason: string | null }> {
  let query = admin
    .from('portal_listings')
    .select('id, agency_id, property_id, portal_ad_id, external_id')
    .eq('portal', STORIA_PORTAL_KEY)
    .eq(column, value);
  if (agencyId) query = query.eq('agency_id', agencyId);

  const { data, error } = await query.limit(2);
  if (error) throw new Error(`Portal listing lookup failed: ${column}`);
  if ((data || []).length > 1) return { listing: null, reason: `ambiguous_${column}` };
  return { listing: (data?.[0] as ListingRow | undefined) || null, reason: null };
}

async function contextFromListing(
  admin: SupabaseClient,
  listing: ListingRow,
): Promise<AssociationResult> {
  if (!listing.property_id) {
    return { context: null, reason: 'listing_without_property', agencyId: listing.agency_id };
  }
  const context = await propertyToContext(admin, listing.property_id, listing.agency_id, listing);
  return context
    ? { context, reason: null, agencyId: context.agencyId }
    : { context: null, reason: 'listing_property_missing', agencyId: listing.agency_id };
}

/** Deterministic order only: public advert id -> API uuid -> property id -> exact URL. */
export async function resolveStoriaProperty(
  admin: SupabaseClient,
  input: IncomingStoriaLead,
  agencyId?: string | null,
): Promise<AssociationResult> {
  const lookupPlan = buildStoriaAdvertLookupPlan(input) as Array<{
    kind: 'portal_ad_id' | 'external_id' | 'property_id' | 'advert_url';
    value: string;
  }>;
  for (const step of lookupPlan) {
    if (step.kind === 'property_id') {
      if (!isUuid(step.value)) continue;
      const context = await propertyToContext(admin, step.value, agencyId);
      if (context) return { context, reason: null, agencyId: context.agencyId };
      continue;
    }
    const found = await uniqueListing(admin, step.kind, step.value, agencyId);
    if (found.reason) return { context: null, reason: found.reason, agencyId: agencyId || null };
    if (found.listing) return contextFromListing(admin, found.listing);
  }

  return {
    context: null,
    reason: normalizePortalAdId(input.ad_id)
      ? 'portal_ad_id_not_found'
      : lookupPlan.length > 0 ? 'advert_identity_not_found' : 'missing_advert_identity',
    agencyId: agencyId || null,
  };
}

async function addLeadActivity(
  admin: SupabaseClient,
  agencyId: string,
  leadId: string,
  message?: string,
): Promise<void> {
  const { error } = await admin.from('activities').insert({
    agency_id: agencyId,
    type: 'request',
    title: 'Solicitare nouă din Storia',
    description: message ? message.slice(0, 500) : 'Mesaj fără text',
    lead_id: leadId,
  });
  if (error) console.error('[Storia webhook] activity insert failed', { leadId });
}

async function upsertAssociatedLead(
  admin: SupabaseClient,
  input: IncomingStoriaLead,
  context: StoriaPropertyContext,
  transactionId: string,
): Promise<LeadIngestResult> {
  const message = input.message?.trim() || '';

  const { data: byTransaction, error: transactionError } = await admin
    .from('leads')
    .select('id')
    .eq('agency_id', context.agencyId)
    .eq('webhook_transaction_id', transactionId)
    .is('deleted_at', null)
    .maybeSingle();
  if (transactionError) throw new Error('Lead transaction deduplication failed');
  if (byTransaction?.id) {
    return { outcome: 'updated', agencyId: context.agencyId, leadId: byTransaction.id };
  }

  if (input.conversation_id && context.portalListingId) {
    const { data: conversations, error: conversationError } = await admin
      .from('leads')
      .select('id')
      .eq('agency_id', context.agencyId)
      .eq('portal_listing_id', context.portalListingId)
      .eq('portal_conversation_id', input.conversation_id)
      .is('deleted_at', null)
      .limit(2);
    if (conversationError) throw new Error('Lead conversation deduplication failed');
    if ((conversations || []).length > 1) throw new Error('Ambiguous lead conversation');
    if (conversations?.[0]?.id) {
      const leadId = conversations[0].id as string;
      await addLeadActivity(admin, context.agencyId, leadId, message);
      return { outcome: 'updated', agencyId: context.agencyId, leadId };
    }
  }

  const record = buildAssociatedStoriaLeadRecord(input, context, transactionId);
  const { data: lead, error } = await admin.from('leads').insert(record).select('id').single();
  if (error || !lead?.id) throw new Error('Storia lead insert failed');

  await addLeadActivity(admin, context.agencyId, lead.id as string, message);
  return { outcome: 'created', agencyId: context.agencyId, leadId: lead.id as string };
}

async function queueUnmatchedMessage(
  admin: SupabaseClient,
  input: IncomingStoriaLead,
  eventId: string,
  reason: string,
  agencyId: string | null,
): Promise<void> {
  const { error } = await admin.from('portal_unmatched_messages').upsert({
    webhook_event_id: eventId,
    agency_id: agencyId,
    portal_id: STORIA_CRM_PORTAL_ID,
    portal: STORIA_PORTAL_KEY,
    portal_ad_id: normalizePortalAdId(input.ad_id),
    external_id: input.external_id || null,
    conversation_id: input.conversation_id || null,
    sender_name: input.sender_name || null,
    sender_email: input.sender_email || null,
    sender_phone: input.sender_phone || null,
    message: input.message || null,
    property_title_hint: input.property_title || null,
    advert_url_hint: input.ad_url || null,
    reason,
    status: 'pending',
    updated_at: new Date().toISOString(),
  }, { onConflict: 'webhook_event_id', ignoreDuplicates: true });
  if (error) throw new Error('Unmatched Storia message could not be queued');
}

export async function ingestStoriaLead(
  admin: SupabaseClient,
  input: IncomingStoriaLead,
  meta: { eventId: string; transactionId: string },
): Promise<LeadIngestResult> {
  const association = await resolveStoriaProperty(admin, input);
  if (!association.context) {
    await queueUnmatchedMessage(
      admin,
      input,
      meta.eventId,
      association.reason,
      association.agencyId,
    );
    return { outcome: 'unmatched', agencyId: null, leadId: null };
  }

  return upsertAssociatedLead(admin, input, association.context, meta.transactionId);
}

export async function linkQueuedStoriaMessage(
  admin: SupabaseClient,
  input: IncomingStoriaLead,
  propertyId: string,
  transactionId: string,
  agencyId: string,
): Promise<LeadIngestResult> {
  const context = await propertyToContext(admin, propertyId, agencyId);
  if (!context) throw new Error('Property not found in agency');

  const { data: listing, error } = await admin
    .from('portal_listings')
    .select('id, agency_id, property_id, portal_ad_id, external_id')
    .eq('agency_id', agencyId)
    .eq('property_id', propertyId)
    .eq('portal', STORIA_PORTAL_KEY)
    .maybeSingle();
  if (error) throw new Error('Property portal listing lookup failed');

  const completeContext: StoriaPropertyContext = listing
    ? (await contextFromListing(admin, listing as ListingRow)).context || context
    : context;
  return upsertAssociatedLead(admin, input, completeContext, transactionId);
}
