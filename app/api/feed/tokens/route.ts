export const dynamic = 'force-dynamic';

import { createFeedToken } from '@/lib/feed-token';
import type { FeedPortal } from '@/lib/property-feed';
import { appendAuditEvent } from '@/lib/server/audit-log';
import { requireApiAuth } from '@/lib/server/api-auth';

const ALLOWED_PORTALS = new Set<FeedPortal>(['generic', 'storia']);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function publicFeedUrl(request: Request, token: string): string {
  return `${new URL(request.url).origin}/api/feed/properties.xml?token=${encodeURIComponent(token)}`;
}

function safeLabel(value: unknown, portal: FeedPortal): string {
  const label = typeof value === 'string' ? value.trim().slice(0, 80) : '';
  return label || (portal === 'storia' ? 'Feed Storia XML' : 'Feed XML standard');
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'feed', action: 'view' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin, agencyId } = auth.context;

  const [tokensResult, logsResult] = await Promise.all([
    serviceAdmin
      .from('feed_tokens')
      .select('id, portal, label, token_prefix, is_active, generation, created_at, updated_at, rotated_at, revoked_at, expires_at, last_used_at, last_success_at, last_error_at')
      .eq('agency_id', agencyId)
      .order('created_at', { ascending: false }),
    serviceAdmin
      .from('feed_export_logs')
      .select('id, token_id, portal, status, included_count, excluded_count, error_count, exclusion_summary, error_code, duration_ms, generated_at, completed_at')
      .eq('agency_id', agencyId)
      .order('generated_at', { ascending: false })
      .limit(25),
  ]);

  if (tokensResult.error || logsResult.error) {
    return Response.json({ error: 'Nu am putut încărca feedurile' }, { status: 500 });
  }

  return Response.json({
    tokens: tokensResult.data || [],
    recent_logs: logsResult.data || [],
  }, { headers: { 'Cache-Control': 'no-store' } });
}
export async function POST(request: Request) {
  const auth = await requireApiAuth(request, { module: 'feed', action: 'create' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin, agencyId, user } = auth.context;
  const body = await request.json().catch(() => ({}));
  const portal = typeof body.portal === 'string' ? body.portal.toLowerCase() as FeedPortal : 'generic';
  if (!ALLOWED_PORTALS.has(portal)) {
    return Response.json({ error: 'Portal de feed neacceptat' }, { status: 400 });
  }

  const ownerEmail = typeof body.owner_email === 'string' ? body.owner_email.trim().toLowerCase() : '';
  if (portal === 'storia' && !EMAIL_PATTERN.test(ownerEmail)) {
    return Response.json({ error: 'E-mailul agenției Storia este obligatoriu' }, { status: 400 });
  }

  const expiresAt = typeof body.expires_at === 'string' && body.expires_at
    ? new Date(body.expires_at)
    : null;
  if (expiresAt && (!Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now())) {
    return Response.json({ error: 'Data expirării trebuie să fie în viitor' }, { status: 400 });
  }

  const generated = createFeedToken();
  const { data, error } = await serviceAdmin.from('feed_tokens').insert({
    agency_id: agencyId,
    portal,
    label: safeLabel(body.label, portal),
    token_hash: generated.tokenHash,
    token_prefix: generated.tokenPrefix,
    config: {
      selection: portal === 'generic' ? 'site' : portal,
      ...(ownerEmail ? { owner_email: ownerEmail } : {}),
    },
    created_by: user.id,
    expires_at: expiresAt?.toISOString() || null,
  }).select('id, portal, label, token_prefix, is_active, generation, created_at, expires_at').single();

  if (error || !data) {
    return Response.json({ error: 'Tokenul de feed nu a putut fi creat' }, { status: 500 });
  }

  await appendAuditEvent({
    client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: auth.context.role,
    action: 'feed.token_created', entityType: 'feed_token', entityId: data.id,
    after: { portal: data.portal, token_prefix: data.token_prefix, generation: data.generation, expires_at: data.expires_at },
  });

  return Response.json({
    token: data,
    feed_url: publicFeedUrl(request, generated.token),
    notice: 'Copiază URL-ul acum. Tokenul complet nu va mai fi afișat.',
  }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
}

export async function PATCH(request: Request) {
  const auth = await requireApiAuth(request, { module: 'feed', action: 'edit' });
  if (!auth.ok) return auth.response;
  const { serviceAdmin, agencyId, user } = auth.context;
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === 'string' ? body.id : '';
  const action = body.action;
  if (!UUID_PATTERN.test(id) || !['rotate', 'revoke'].includes(action)) {
    return Response.json({ error: 'Acțiune de feed invalidă' }, { status: 400 });
  }

  const { data: existing, error: findError } = await serviceAdmin
    .from('feed_tokens')
    .select('id, portal, token_prefix, is_active, generation')
    .eq('id', id)
    .eq('agency_id', agencyId)
    .maybeSingle();
  if (findError || !existing) return Response.json({ error: 'Feedul nu există' }, { status: 404 });

  if (action === 'revoke') {
    const { error } = await serviceAdmin.from('feed_tokens').update({
      is_active: false,
      revoked_at: new Date().toISOString(),
      revoked_by: user.id,
      updated_at: new Date().toISOString(),
    }).eq('id', id).eq('agency_id', agencyId);
    if (error) return Response.json({ error: 'Feedul nu a putut fi revocat' }, { status: 500 });
    await appendAuditEvent({
      client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: auth.context.role,
      action: 'feed.token_revoked', entityType: 'feed_token', entityId: id,
      before: existing, after: { ...existing, is_active: false },
    });
    return Response.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
  }

  const generated = createFeedToken();
  const { error } = await serviceAdmin.from('feed_tokens').update({
    token_hash: generated.tokenHash,
    token_prefix: generated.tokenPrefix,
    is_active: true,
    generation: Number(existing.generation || 1) + 1,
    rotated_at: new Date().toISOString(),
    revoked_at: null,
    revoked_by: null,
    updated_at: new Date().toISOString(),
  }).eq('id', id).eq('agency_id', agencyId);
  if (error) return Response.json({ error: 'Tokenul nu a putut fi rotit' }, { status: 500 });

  await appendAuditEvent({
    client: serviceAdmin, request, agencyId, actorUserId: user.id, actorRole: auth.context.role,
    action: 'feed.token_rotated', entityType: 'feed_token', entityId: id,
    before: existing,
    after: {
      portal: existing.portal,
      token_prefix: generated.tokenPrefix,
      is_active: true,
      generation: Number(existing.generation || 1) + 1,
    },
  });

  return Response.json({
    success: true,
    feed_url: publicFeedUrl(request, generated.token),
    token_prefix: generated.tokenPrefix,
    notice: 'Copiază URL-ul acum. Tokenul vechi a fost invalidat.',
  }, { headers: { 'Cache-Control': 'no-store' } });
}
