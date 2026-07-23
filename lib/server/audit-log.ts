import 'server-only';

import { randomUUID } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';

import { hashAuditIp, normalizedForwardedIp, redactAuditValue } from '@/lib/audit-values';

export type AuditResult = 'success' | 'denied' | 'failure';

export interface AuditEventInput {
  client: SupabaseClient;
  request?: Request;
  agencyId?: string | null;
  actorUserId?: string | null;
  actorRole?: string | null;
  action: string;
  entityType: string;
  entityId?: string | null;
  before?: unknown;
  after?: unknown;
  result?: AuditResult;
  reason?: string | null;
  metadata?: unknown;
}

function requestMetadata(request?: Request) {
  if (!request) {
    return { route: null, ipHash: null, userAgent: null, requestId: randomUUID() };
  }
  const route = (() => {
    try { return new URL(request.url).pathname.slice(0, 500); } catch { return null; }
  })();
  const forwardedIp = normalizedForwardedIp(
    request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip'),
  );
  const requestId = (
    request.headers.get('x-request-id')
    || request.headers.get('x-vercel-id')
    || randomUUID()
  ).slice(0, 200);
  return {
    route,
    ipHash: hashAuditIp(forwardedIp, process.env.AUDIT_IP_HASH_SALT),
    userAgent: request.headers.get('user-agent')?.slice(0, 500) || null,
    requestId,
  };
}

export async function appendAuditEvent(input: AuditEventInput): Promise<string> {
  const request = requestMetadata(input.request);
  const { data, error } = await input.client.rpc('crm_append_audit_event', {
    p_agency_id: input.agencyId || null,
    p_actor_user_id: input.actorUserId || null,
    p_actor_role: input.actorRole || null,
    p_action: input.action,
    p_entity_type: input.entityType,
    p_entity_id: input.entityId || null,
    p_before_values: input.before == null ? null : redactAuditValue(input.before),
    p_after_values: input.after == null ? null : redactAuditValue(input.after),
    p_result: input.result || 'success',
    p_reason: input.reason?.slice(0, 1_000) || null,
    p_route: request.route,
    p_ip_hash: request.ipHash,
    p_user_agent: request.userAgent,
    p_request_id: request.requestId,
    p_metadata: redactAuditValue(input.metadata || {}),
  });
  if (error || !data) {
    throw new Error(`audit_log_failed:${error?.message || 'missing_event_id'}`);
  }
  return String(data);
}
