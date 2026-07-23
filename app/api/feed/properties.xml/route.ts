export const dynamic = 'force-dynamic';

import { hashFeedToken } from '@/lib/feed-token';
import {
  buildPropertyFeed,
  evaluatePropertyForFeed,
  validatePropertyFeedXml,
  type FeedDecision,
  type FeedPortal,
  type FeedProperty,
} from '@/lib/property-feed';
import { appendAuditEvent } from '@/lib/server/audit-log';
import { getAdminClient } from '@/lib/server/api-auth';

type FeedTokenRow = {
  id: string;
  agency_id: string;
  portal: FeedPortal;
  config: Record<string, unknown> | null;
  expires_at: string | null;
};

const PROPERTY_COLUMNS = 'id, agency_id, internal_code, title, description, price, currency, category, transaction, status, city, county, zone, street, street_number, surface_useful, surface_built, surface_land, latitude, longitude, attributes, created_at, updated_at';
const PAGE_SIZE = 1000;

function plainError(message: string, status: number): Response {
  return new Response(message, {
    status,
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

async function loadAgencyProperties(agencyId: string): Promise<FeedProperty[]> {
  const admin = getAdminClient();
  const rows: FeedProperty[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await admin
      .from('properties')
      .select(PROPERTY_COLUMNS)
      .eq('agency_id', agencyId)
      .is('deleted_at', null)
      .order('id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error('property_query_failed');
    rows.push(...((data || []) as FeedProperty[]));
    if (!data || data.length < PAGE_SIZE) break;
  }
  return rows;
}

function exclusionSummary(decisions: FeedDecision[]): Record<string, number> {
  const summary: Record<string, number> = {};
  for (const decision of decisions) {
    for (const reason of decision.reasons) summary[reason] = (summary[reason] || 0) + 1;
  }
  return summary;
}

async function writeExportLog(input: {
  token: FeedTokenRow;
  decisions: FeedDecision[];
  status: 'success' | 'invalid_xml' | 'error';
  errorCode?: string;
  durationMs: number;
}): Promise<string> {
  const admin = getAdminClient();
  const included = input.decisions.filter(decision => decision.included);
  const excluded = input.decisions.filter(decision => !decision.included);
  const { data: log, error: logError } = await admin.from('feed_export_logs').insert({
    token_id: input.token.id,
    agency_id: input.token.agency_id,
    portal: input.token.portal,
    status: input.status,
    included_count: included.length,
    excluded_count: excluded.length,
    error_count: input.status === 'success' ? 0 : 1,
    exclusion_summary: exclusionSummary(excluded),
    error_code: input.errorCode || null,
    error_message: input.errorCode ? 'Feed generation failed; inspect the validated error code.' : null,
    duration_ms: input.durationMs,
    completed_at: new Date().toISOString(),
  }).select('id').single();
  if (logError || !log) throw new Error('feed_log_failed');

  const items = input.decisions.map(decision => ({
    export_log_id: log.id,
    property_id: decision.property.source.id,
    internal_code: decision.property.code || null,
    result: decision.included ? 'included' : 'excluded',
    reason: decision.reasons.join(',') || null,
  }));
  for (let offset = 0; offset < items.length; offset += 500) {
    const { error } = await admin.from('feed_export_log_items').insert(items.slice(offset, offset + 500));
    if (error) {
      await admin.from('feed_export_logs').update({ status: 'error', error_count: 1, error_code: 'feed_log_items_failed' }).eq('id', log.id);
      throw new Error('feed_log_items_failed');
    }
  }
  return log.id;
}
export async function GET(request: Request) {
  const startedAt = Date.now();
  const url = new URL(request.url);
  if (url.searchParams.has('agency_id')) {
    return plainError('Accesul prin agency_id a fost dezactivat. Folosește tokenul feedului.', 401);
  }
  const rawToken = url.searchParams.get('token') || '';
  const tokenHash = hashFeedToken(rawToken);
  if (!tokenHash) return plainError('Token feed invalid.', 401);

  const admin = getAdminClient();
  const { data, error } = await admin
    .from('feed_tokens')
    .select('id, agency_id, portal, config, expires_at')
    .eq('token_hash', tokenHash)
    .eq('is_active', true)
    .maybeSingle();
  const token = data as FeedTokenRow | null;
  if (error || !token || !['generic', 'storia'].includes(token.portal)) {
    return plainError('Token feed invalid.', 401);
  }
  if (token.expires_at && new Date(token.expires_at).getTime() <= Date.now()) {
    await admin.from('feed_tokens').update({ last_error_at: new Date().toISOString() }).eq('id', token.id);
    return plainError('Token feed invalid.', 401);
  }

  try {
    const properties = await loadAgencyProperties(token.agency_id);
    const decisions = properties.map(property => evaluatePropertyForFeed(property, token.portal));
    const included = decisions.filter(decision => decision.included).map(decision => decision.property);
    const config = token.config || {};
    const ownerEmail = typeof config.owner_email === 'string' ? config.owner_email : '';
    const generatedAt = new Date().toISOString();
    const xml = buildPropertyFeed(token.portal, included, generatedAt, ownerEmail);
    const validationErrors = validatePropertyFeedXml(xml, token.portal);

    if (validationErrors.length > 0) {
      const exportLogId = await writeExportLog({
        token,
        decisions,
        status: 'invalid_xml',
        errorCode: validationErrors.join(',').slice(0, 500),
        durationMs: Date.now() - startedAt,
      });
      await admin.from('feed_tokens').update({ last_used_at: generatedAt, last_error_at: generatedAt }).eq('id', token.id);
      await appendAuditEvent({
        client: admin, request, agencyId: token.agency_id, actorRole: 'system',
        action: 'feed.exported', entityType: 'feed_export', entityId: exportLogId,
        result: 'failure', reason: 'invalid_xml',
        after: { portal: token.portal, included_count: included.length, validation_error_count: validationErrors.length },
        metadata: { token_id: token.id },
      });
      return plainError('Feedul nu a trecut validarea XML.', 500);
    }

    const exportLogId = await writeExportLog({
      token, decisions, status: 'success', durationMs: Date.now() - startedAt,
    });
    await admin.from('feed_tokens').update({
      last_used_at: generatedAt,
      last_success_at: generatedAt,
      last_error_at: null,
    }).eq('id', token.id);
    await appendAuditEvent({
      client: admin, request, agencyId: token.agency_id, actorRole: 'system',
      action: 'feed.exported', entityType: 'feed_export', entityId: exportLogId,
      after: {
        portal: token.portal,
        included_count: included.length,
        excluded_count: decisions.length - included.length,
      },
      metadata: { token_id: token.id },
    });

    return new Response(xml, {
      headers: {
        'Content-Type': 'application/xml; charset=utf-8',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (caught) {
    const errorCode = caught instanceof Error ? caught.message.slice(0, 100) : 'feed_generation_failed';
    await admin.from('feed_tokens').update({ last_error_at: new Date().toISOString() }).eq('id', token.id);
    return plainError(errorCode === 'feed_log_failed' || errorCode === 'feed_log_items_failed'
      ? 'Jurnalul feedului nu a putut fi salvat.'
      : 'Feedul nu a putut fi generat.', 503);
  }
}
