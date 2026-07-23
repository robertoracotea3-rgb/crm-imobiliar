import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import {
  safeObservationCode,
  sanitizeObservationMessage,
  sanitizeObservationMetadata,
} from '@/lib/observability-core';
import { getAdminClient } from '@/lib/server/api-auth';

const SERVICE_RE = /^[a-z][a-z0-9_.:-]{1,79}$/;

export type SystemOperationStatus = 'succeeded' | 'degraded' | 'failed' | 'stalled' | 'cancelled';
export type SystemTrigger = 'api' | 'cron' | 'webhook' | 'manual' | 'system';

export interface SystemOperationHandle {
  id: string;
}

export interface StartSystemOperationInput {
  agencyId?: string | null;
  serviceCode: string;
  operation: string;
  triggerType?: SystemTrigger;
  correlationKey?: string | null;
  route?: string | null;
  method?: string | null;
  metadata?: Record<string, unknown>;
}

export interface FinishSystemOperationInput {
  status: SystemOperationStatus;
  httpStatus?: number | null;
  processedCount?: number;
  successCount?: number;
  errorCount?: number;
  retryCount?: number;
  errorCode?: string | null;
  errorMessage?: string | null;
  nextRunAt?: string | null;
  metadata?: Record<string, unknown>;
}

function boundedCount(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

export async function startSystemOperation(
  client: SupabaseClient,
  input: StartSystemOperationInput,
): Promise<SystemOperationHandle> {
  if (!SERVICE_RE.test(input.serviceCode) || !SERVICE_RE.test(input.operation)) {
    throw new Error('Codul operațiunii de monitorizare este invalid.');
  }
  const { data, error } = await client.rpc('crm_start_system_operation', {
    p_agency_id: input.agencyId || null,
    p_service_code: input.serviceCode,
    p_operation: input.operation,
    p_trigger_type: input.triggerType || 'system',
    p_correlation_key: input.correlationKey || null,
    p_route: input.route?.split('?')[0].slice(0, 300) || null,
    p_method: input.method?.toUpperCase().slice(0, 12) || null,
    p_metadata: sanitizeObservationMetadata(input.metadata),
  });
  if (error || typeof data !== 'string') {
    throw new Error('Operațiunea de monitorizare nu a putut porni.');
  }
  return { id: data };
}

export async function finishSystemOperation(
  client: SupabaseClient,
  handle: SystemOperationHandle,
  input: FinishSystemOperationInput,
): Promise<void> {
  const { data, error } = await client.rpc('crm_finish_system_operation', {
    p_run_id: handle.id,
    p_status: input.status,
    p_http_status: input.httpStatus || null,
    p_processed_count: boundedCount(input.processedCount),
    p_success_count: boundedCount(input.successCount),
    p_error_count: boundedCount(input.errorCount),
    p_retry_count: boundedCount(input.retryCount),
    p_error_code: input.errorCode ? safeObservationCode(input.errorCode, 'operation_failed') : null,
    p_error_message: input.errorMessage
      ? sanitizeObservationMessage(input.errorMessage)
      : null,
    p_next_run_at: input.nextRunAt || null,
    p_metadata: sanitizeObservationMetadata(input.metadata),
  });
  if (error || data !== true) throw new Error('Operațiunea de monitorizare nu a putut fi finalizată.');
}

export async function recordUnhandledServerError(input: {
  route: string;
  method: string;
  routeType: string;
  digest?: string | null;
}): Promise<boolean> {
  try {
    const client = getAdminClient();
    const { error } = await client.rpc('crm_record_system_failure', {
      p_agency_id: null,
      p_service_code: 'api',
      p_operation: 'unhandled_server_error',
      p_trigger_type: 'api',
      p_error_code: 'next_unhandled_error',
      p_error_message: 'Next.js a capturat o eroare internă necontrolată.',
      p_route: input.route.split('?')[0].slice(0, 300),
      p_method: input.method.toUpperCase().slice(0, 12),
      p_http_status: 500,
      p_metadata: sanitizeObservationMetadata({
        route_type: input.routeType,
        digest: input.digest?.slice(0, 120) || null,
      }),
    });
    return !error;
  } catch {
    // Observability must not create a second failure while handling the first one.
    return false;
  }
}
