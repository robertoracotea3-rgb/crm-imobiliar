export const dynamic = 'force-dynamic';

import { appendAuditEvent } from '@/lib/server/audit-log';
import { requireApiAuth } from '@/lib/server/api-auth';
import {
  healthStatusFromCounts,
  newestTimestamp,
  oldestFutureTimestamp,
  overallSystemStatus,
  systemHealthSummary,
  type SystemHealthService,
  type SystemHealthStatus,
} from '@/lib/system-health';

type Row = Record<string, unknown>;

const number = (value: unknown) => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
const text = (value: unknown) => typeof value === 'string' && value ? value : null;
const date = (value: unknown) => {
  const candidate = text(value);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : null;
};
const rows = (value: unknown): Row[] => Array.isArray(value) ? value as Row[] : [];

function latestBy(items: Row[], field: string): Row | null {
  return [...items].sort(
    (left, right) => Date.parse(date(right[field]) || '1970-01-01')
      - Date.parse(date(left[field]) || '1970-01-01'),
  )[0] || null;
}

function safeError(code: string | null, fallback: string): string | null {
  return code ? fallback : null;
}

function normalizedStatus(value: unknown): SystemHealthStatus {
  const status = text(value);
  return ['never', 'running', 'healthy', 'degraded', 'failed', 'stalled'].includes(status || '')
    ? status as SystemHealthStatus
    : 'never';
}

export async function GET(request: Request) {
  const auth = await requireApiAuth(request, { module: 'settings', action: 'view' });
  if (!auth.ok) return auth.response;
  const {
    serviceAdmin, agencyId, role, user,
  } = auth.context;

  if (!['owner', 'admin'].includes(role)) {
    await appendAuditEvent({
      client: serviceAdmin,
      request,
      agencyId,
      actorUserId: user.id,
      actorRole: role,
      action: 'observability.access_denied',
      entityType: 'system_health',
      result: 'denied',
      reason: 'owner_or_admin_required',
    }).catch(() => undefined);
    return Response.json({ error: 'Panoul este disponibil numai pentru owner și admin.' }, { status: 403 });
  }

  const now = new Date();
  const since = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();
  const stalledBefore = new Date(now.getTime() - 10 * 60 * 1000).getTime();
  const { error: stalledError } = await serviceAdmin.rpc(
    'crm_mark_stalled_system_operations',
    { p_threshold: '10 minutes' },
  );
  if (stalledError) {
    return Response.json({
      error: 'Migrarea de observabilitate nu este aplicată sau registrul de sănătate nu este disponibil.',
      needs_migration: true,
    }, { status: 409 });
  }

  const [
    sharedHealthResult,
    sharedRunsResult,
    webhookResult,
    portalHealthResult,
    prospectHealthResult,
    feedResult,
    automationJobsResult,
    automationLogsResult,
    removalJobsResult,
    mediaJobsResult,
    matchingJobsResult,
    securityEventsResult,
    auditResult,
    globalWebhookRejectedResult,
    globalLocksResult,
    globalApiErrorsResult,
  ] = await Promise.all([
    serviceAdmin.from('crm_system_service_health').select(
      'service_code,status,last_started_at,last_success_at,last_error_at,last_error_code,last_duration_ms,next_run_at,retry_count,consecutive_failures,metrics',
    ).eq('agency_id', agencyId),
    serviceAdmin.from('crm_system_operation_runs').select(
      'id,service_code,operation,status,started_at,finished_at,duration_ms,error_code,http_status,processed_count,error_count,retry_count',
    ).eq('agency_id', agencyId).order('started_at', { ascending: false }).limit(50),
    serviceAdmin.from('webhook_events').select(
      'processing_status,error_code,duplicate_count,received_at,processing_started_at,processed_at',
    ).eq('agency_id', agencyId).gte('received_at', since).order('received_at', { ascending: false }).limit(500),
    serviceAdmin.from('portal_sync_health').select(
      'portal,status,last_started_at,last_success_at,last_error_at,last_error_code,last_duration_ms,last_checked_count,consecutive_failures,stale_listing_count,next_run_at',
    ).eq('agency_id', agencyId),
    serviceAdmin.from('prospect_source_health').select(
      'source,label,active,compliance_status,last_run_at,last_success_at,last_error_at,last_duration_ms,last_processed_count,consecutive_failures',
    ).eq('agency_id', agencyId),
    serviceAdmin.from('feed_export_logs').select(
      'portal,status,error_code,duration_ms,generated_at,completed_at,included_count,excluded_count,error_count',
    ).eq('agency_id', agencyId).gte('generated_at', since).order('generated_at', { ascending: false }).limit(200),
    serviceAdmin.from('automation_jobs').select(
      'status,attempts,max_attempts,run_after,locked_at,completed_at,updated_at',
    ).eq('agency_id', agencyId).in('status', ['pending', 'processing', 'retry', 'failed']).limit(500),
    serviceAdmin.from('automation_run_logs').select(
      'status,duration_ms,created_at,attempt',
    ).eq('agency_id', agencyId).gte('created_at', since).order('created_at', { ascending: false }).limit(200),
    serviceAdmin.from('portal_removal_jobs').select(
      'status,attempts,max_attempts,next_attempt_at,started_at,confirmed_at,updated_at',
    ).eq('agency_id', agencyId).in('status', ['pending', 'processing', 'retry', 'failed']).limit(500),
    serviceAdmin.from('property_media_cleanup_jobs').select(
      'status,attempts,max_attempts,next_attempt_at,started_at,confirmed_at,updated_at',
    ).eq('agency_id', agencyId).in('status', ['pending', 'processing', 'retry', 'failed']).limit(500),
    serviceAdmin.from('demand_match_refresh_queue').select(
      'status,attempts,created_at,processed_at',
    ).eq('agency_id', agencyId).limit(500),
    serviceAdmin.from('security_events').select(
      'event_type,result,reason,created_at',
    ).eq('agency_id', agencyId).gte('created_at', since).order('created_at', { ascending: false }).limit(500),
    serviceAdmin.from('crm_audit_log').select(
      'action,result,reason,occurred_at',
    ).eq('agency_id', agencyId).gte('occurred_at', since).order('occurred_at', { ascending: false }).limit(500),
    serviceAdmin.from('webhook_events').select('id', { count: 'exact', head: true })
      .is('agency_id', null).in('processing_status', ['failed', 'rejected']).gte('received_at', since),
    serviceAdmin.from('crm_auth_rate_limits').select('scope', { count: 'exact', head: true })
      .gt('locked_until', now.toISOString()),
    serviceAdmin.from('crm_system_operation_runs').select('id', { count: 'exact', head: true })
      .is('agency_id', null).eq('service_code', 'api').in('status', ['failed', 'stalled']).gte('started_at', since),
  ]);

  const sourceErrors = [
    sharedHealthResult.error,
    sharedRunsResult.error,
    webhookResult.error,
    portalHealthResult.error,
    prospectHealthResult.error,
    feedResult.error,
    automationJobsResult.error,
    automationLogsResult.error,
    removalJobsResult.error,
    mediaJobsResult.error,
    matchingJobsResult.error,
    securityEventsResult.error,
    auditResult.error,
  ].filter(Boolean).length;

  const services: SystemHealthService[] = rows(sharedHealthResult.data).map((item) => ({
    code: String(item.service_code),
    label: item.service_code === 'portal.storia' ? 'Sincronizare Storia'
      : item.service_code === 'automations' ? 'Motor automatizări'
        : String(item.service_code),
    status: normalizedStatus(item.status),
    last_started_at: date(item.last_started_at),
    last_success_at: date(item.last_success_at),
    last_error_at: date(item.last_error_at),
    last_error_code: text(item.last_error_code),
    last_error: safeError(text(item.last_error_code), 'Ultima execuție a raportat o eroare controlată.'),
    duration_ms: item.last_duration_ms == null ? null : number(item.last_duration_ms),
    next_run_at: date(item.next_run_at),
    retry_count: number(item.retry_count),
    metrics: {
      consecutive_failures: number(item.consecutive_failures),
      ...((item.metrics && typeof item.metrics === 'object') ? item.metrics as Record<string, number | string | boolean | null> : {}),
    },
  }));
  const serviceCodes = new Set(services.map(service => service.code));

  const webhookRows = rows(webhookResult.data);
  const webhookFailed = webhookRows.filter(item => ['failed', 'rejected'].includes(String(item.processing_status)));
  const webhookStalled = webhookRows.filter(item => item.processing_status === 'processing'
    && Date.parse(date(item.processing_started_at) || date(item.received_at) || now.toISOString()) <= stalledBefore);
  const webhookSuccess = webhookRows.filter(item => item.processing_status === 'processed');
  services.push({
    code: 'webhook.storia',
    label: 'Webhook Storia',
    status: healthStatusFromCounts({
      hasHistory: webhookRows.length > 0,
      stalled: webhookStalled.length,
      failed: webhookFailed.length,
    }),
    last_started_at: newestTimestamp(webhookRows.map(item => date(item.received_at))),
    last_success_at: newestTimestamp(webhookSuccess.map(item => date(item.processed_at))),
    last_error_at: newestTimestamp(webhookFailed.map(item => date(item.received_at))),
    last_error_code: webhookStalled.length ? 'webhook_processing_stalled'
      : text(latestBy(webhookFailed, 'received_at')?.error_code),
    last_error: webhookStalled.length
      ? `${webhookStalled.length} evenimente nu au terminat procesarea.`
      : webhookFailed.length ? `${webhookFailed.length} evenimente au fost respinse sau au eșuat în ultimele 24 ore.` : null,
    duration_ms: null,
    next_run_at: null,
    retry_count: webhookRows.reduce((sum, item) => sum + number(item.duplicate_count), 0),
    metrics: {
      processed_24h: webhookSuccess.length,
      failed_24h: webhookFailed.length,
      stalled: webhookStalled.length,
      platform_rejected_24h: globalWebhookRejectedResult.count || 0,
    },
  });

  for (const item of rows(portalHealthResult.data)) {
    const code = `portal.${String(item.portal)}`;
    if (serviceCodes.has(code)) continue;
    services.push({
      code,
      label: `Sincronizare ${String(item.portal).toUpperCase()}`,
      status: normalizedStatus(item.status),
      last_started_at: date(item.last_started_at),
      last_success_at: date(item.last_success_at),
      last_error_at: date(item.last_error_at),
      last_error_code: text(item.last_error_code),
      last_error: safeError(text(item.last_error_code), 'Sincronizarea portalului necesită verificare.'),
      duration_ms: item.last_duration_ms == null ? null : number(item.last_duration_ms),
      next_run_at: date(item.next_run_at),
      retry_count: number(item.consecutive_failures),
      metrics: {
        checked: number(item.last_checked_count),
        stale: number(item.stale_listing_count),
      },
    });
  }

  for (const item of rows(prospectHealthResult.data)) {
    const failures = number(item.consecutive_failures);
    const active = item.active === true;
    const approved = item.compliance_status === 'approved';
    services.push({
      code: `imports.${String(item.source)}`,
      label: `Import particulari · ${String(item.label || item.source)}`,
      status: !active || !approved ? 'never'
        : failures > 0 ? 'degraded'
          : item.last_success_at ? 'healthy' : 'never',
      last_started_at: date(item.last_run_at),
      last_success_at: date(item.last_success_at),
      last_error_at: date(item.last_error_at),
      last_error_code: failures > 0 ? 'prospect_import_failed' : null,
      last_error: failures > 0 ? `Sursa are ${failures} execuții eșuate consecutiv.` : null,
      duration_ms: item.last_duration_ms == null ? null : number(item.last_duration_ms),
      next_run_at: null,
      retry_count: failures,
      metrics: {
        active,
        compliance_approved: approved,
        processed: number(item.last_processed_count),
      },
    });
  }

  const feedRows = rows(feedResult.data);
  const feedFailed = feedRows.filter(item => item.status !== 'success');
  const feedSuccess = feedRows.filter(item => item.status === 'success');
  services.push({
    code: 'feed.xml',
    label: 'Feeduri XML',
    status: healthStatusFromCounts({ hasHistory: feedRows.length > 0, failed: feedFailed.length }),
    last_started_at: newestTimestamp(feedRows.map(item => date(item.generated_at))),
    last_success_at: newestTimestamp(feedSuccess.map(item => date(item.completed_at) || date(item.generated_at))),
    last_error_at: newestTimestamp(feedFailed.map(item => date(item.completed_at) || date(item.generated_at))),
    last_error_code: text(latestBy(feedFailed, 'generated_at')?.error_code),
    last_error: feedFailed.length ? `${feedFailed.length} generări nu au trecut verificarea în ultimele 24 ore.` : null,
    duration_ms: latestBy(feedRows, 'generated_at')?.duration_ms == null
      ? null : number(latestBy(feedRows, 'generated_at')?.duration_ms),
    next_run_at: null,
    retry_count: 0,
    metrics: {
      generated_24h: feedRows.length,
      success_24h: feedSuccess.length,
      errors_24h: feedFailed.length,
    },
  });

  const jobService = (
    code: string,
    label: string,
    jobRows: Row[],
    options: { pending: string[]; processing: string[]; retry: string[]; failed: string[]; timeField: string },
  ): SystemHealthService => {
    const processing = jobRows.filter(item => options.processing.includes(String(item.status)));
    const stalled = processing.filter(item => Date.parse(
      date(item.started_at) || date(item.locked_at) || date(item.updated_at) || now.toISOString(),
    ) <= stalledBefore);
    const failed = jobRows.filter(item => options.failed.includes(String(item.status)));
    const retrying = jobRows.filter(item => options.retry.includes(String(item.status)));
    const pending = jobRows.filter(item => options.pending.includes(String(item.status)));
    return {
      code,
      label,
      status: healthStatusFromCounts({
        hasHistory: jobRows.length > 0,
        running: processing.length,
        stalled: stalled.length,
        failed: failed.length,
        retrying: retrying.length,
      }),
      last_started_at: newestTimestamp(jobRows.map(item => date(item.started_at) || date(item.locked_at) || date(item.updated_at))),
      last_success_at: newestTimestamp(jobRows.map(item => date(item.confirmed_at) || date(item.completed_at) || date(item.processed_at))),
      last_error_at: newestTimestamp(failed.map(item => date(item.updated_at) || date(item.created_at))),
      last_error_code: stalled.length ? 'job_stalled' : failed.length ? 'job_failed' : null,
      last_error: stalled.length ? `${stalled.length} joburi sunt blocate.`
        : failed.length ? `${failed.length} joburi au eșuat.` : null,
      duration_ms: null,
      next_run_at: oldestFutureTimestamp(jobRows.map(item => date(item[options.timeField])), now.getTime()),
      retry_count: retrying.reduce((sum, item) => sum + number(item.attempts), 0),
      metrics: {
        pending: pending.length,
        processing: processing.length,
        retrying: retrying.length,
        failed: failed.length,
        stalled: stalled.length,
      },
    };
  };

  const automationJobs = rows(automationJobsResult.data);
  const automationLogs = rows(automationLogsResult.data);
  const automationService = jobService('automations.queue', 'Coadă automatizări', automationJobs, {
    pending: ['pending'], processing: ['processing'], retry: ['retry'], failed: ['failed'], timeField: 'run_after',
  });
  const latestAutomationLog = latestBy(automationLogs, 'created_at');
  automationService.last_success_at = newestTimestamp(automationLogs
    .filter(item => item.status === 'completed').map(item => date(item.created_at)));
  automationService.last_error_at = newestTimestamp(automationLogs
    .filter(item => ['failed', 'retry'].includes(String(item.status))).map(item => date(item.created_at)));
  automationService.duration_ms = latestAutomationLog?.duration_ms == null
    ? null : number(latestAutomationLog.duration_ms);
  services.push(automationService);

  services.push(jobService('portals.removal', 'Retrageri de pe portaluri', rows(removalJobsResult.data), {
    pending: ['pending'], processing: ['processing'], retry: ['retry'], failed: ['failed'], timeField: 'next_attempt_at',
  }));
  services.push(jobService('media.cleanup', 'Curățare fotografii', rows(mediaJobsResult.data), {
    pending: ['pending'], processing: ['processing'], retry: ['retry'], failed: ['failed'], timeField: 'next_attempt_at',
  }));
  services.push(jobService('matching.queue', 'Recalculare potriviri', rows(matchingJobsResult.data), {
    pending: ['pending'], processing: ['processing'], retry: ['retry'], failed: ['failed'], timeField: 'created_at',
  }));

  const securityRows = rows(securityEventsResult.data);
  const auditRows = rows(auditResult.data);
  const authAudit = auditRows.filter(item => String(item.action).startsWith('auth.'));
  const authFailures = authAudit.filter(item => item.result !== 'success');
  const denied = securityRows.filter(item => item.result === 'denied' || item.result === 'failure');
  const activeLocks = globalLocksResult.count || 0;
  services.push({
    code: 'authentication',
    label: 'Autentificări și acces suspect',
    status: activeLocks > 0 || authFailures.length > 0 || denied.length >= 10 ? 'degraded'
      : authAudit.length || securityRows.length ? 'healthy' : 'never',
    last_started_at: newestTimestamp(authAudit.map(item => date(item.occurred_at))),
    last_success_at: newestTimestamp(authAudit
      .filter(item => item.result === 'success').map(item => date(item.occurred_at))),
    last_error_at: newestTimestamp([
      ...authFailures.map(item => date(item.occurred_at)),
      ...denied.map(item => date(item.created_at)),
    ]),
    last_error_code: activeLocks > 0 ? 'active_auth_locks'
      : authFailures.length || denied.length ? 'suspicious_auth_activity' : null,
    last_error: activeLocks > 0
      ? `${activeLocks} blocări temporare sunt active la nivelul platformei.`
      : authFailures.length || denied.length
        ? 'Au fost înregistrate autentificări sau accesări refuzate în ultimele 24 ore.'
        : null,
    duration_ms: null,
    next_run_at: null,
    retry_count: activeLocks,
    metrics: {
      active_platform_locks: activeLocks,
      agency_denied_24h: denied.length,
      auth_failures_24h: authFailures.length,
    },
  });

  const apiFailures = auditRows.filter(item => item.result === 'failure');
  const apiSuccesses = auditRows.filter(item => item.result === 'success');
  const globalUnhandled = globalApiErrorsResult.count || 0;
  services.push({
    code: 'api',
    label: 'API și erori de server',
    status: sourceErrors > 0 || globalUnhandled > 0 || apiFailures.length > 0 ? 'degraded'
      : auditRows.length > 0 ? 'healthy' : 'never',
    last_started_at: newestTimestamp(auditRows.map(item => date(item.occurred_at))),
    last_success_at: newestTimestamp(apiSuccesses.map(item => date(item.occurred_at))),
    last_error_at: newestTimestamp(apiFailures.map(item => date(item.occurred_at))),
    last_error_code: sourceErrors > 0 ? 'health_source_unavailable'
      : globalUnhandled > 0 ? 'next_unhandled_error'
        : apiFailures.length ? 'api_operation_failed' : null,
    last_error: sourceErrors > 0 ? `${sourceErrors} surse de monitorizare nu au răspuns.`
      : globalUnhandled > 0 ? `${globalUnhandled} erori necontrolate au fost capturate în ultimele 24 ore.`
        : apiFailures.length ? `${apiFailures.length} operațiuni API auditate au eșuat.` : null,
    duration_ms: null,
    next_run_at: null,
    retry_count: 0,
    metrics: {
      audited_requests_24h: auditRows.length,
      failures_24h: apiFailures.length,
      error_rate_percent: auditRows.length ? Number((apiFailures.length * 100 / auditRows.length).toFixed(2)) : 0,
      unhandled_platform_errors_24h: globalUnhandled,
      unavailable_health_sources: sourceErrors,
    },
  });

  const uniqueServices = Array.from(
    new Map(services.map(service => [service.code, service])).values(),
  ).sort((left, right) => left.label.localeCompare(right.label, 'ro'));

  return Response.json({
    generated_at: now.toISOString(),
    overall_status: overallSystemStatus(uniqueServices),
    summary: systemHealthSummary(uniqueServices),
    services: uniqueServices,
    recent_runs: rows(sharedRunsResult.data).map(item => ({
      id: item.id,
      service_code: item.service_code,
      operation: item.operation,
      status: item.status,
      started_at: item.started_at,
      finished_at: item.finished_at,
      duration_ms: item.duration_ms,
      error_code: item.error_code,
      http_status: item.http_status,
      processed_count: item.processed_count,
      error_count: item.error_count,
      retry_count: item.retry_count,
    })),
  }, { headers: { 'Cache-Control': 'no-store' } });
}
