export type SystemHealthStatus = 'never' | 'running' | 'healthy' | 'degraded' | 'failed' | 'stalled';

export interface SystemHealthService {
  code: string;
  label: string;
  status: SystemHealthStatus;
  last_started_at: string | null;
  last_success_at: string | null;
  last_error_at: string | null;
  last_error_code: string | null;
  last_error: string | null;
  duration_ms: number | null;
  next_run_at: string | null;
  retry_count: number;
  metrics: Record<string, number | string | boolean | null>;
}

const STATUS_WEIGHT: Record<SystemHealthStatus, number> = {
  failed: 6,
  stalled: 5,
  degraded: 4,
  running: 3,
  never: 2,
  healthy: 1,
};

export function newestTimestamp(values: Array<string | null | undefined>): string | null {
  const valid = values
    .filter((value): value is string => Boolean(value && Number.isFinite(Date.parse(value))))
    .sort((left, right) => Date.parse(right) - Date.parse(left));
  return valid[0] || null;
}

export function oldestFutureTimestamp(
  values: Array<string | null | undefined>,
  now = Date.now(),
): string | null {
  const valid = values
    .filter((value): value is string => Boolean(value && Date.parse(value) >= now))
    .sort((left, right) => Date.parse(left) - Date.parse(right));
  return valid[0] || null;
}

export function overallSystemStatus(services: SystemHealthService[]): SystemHealthStatus {
  if (services.length === 0) return 'never';
  return [...services]
    .sort((left, right) => STATUS_WEIGHT[right.status] - STATUS_WEIGHT[left.status])[0]
    .status;
}

export function systemHealthSummary(services: SystemHealthService[]) {
  return services.reduce((summary, service) => {
    summary[service.status] += 1;
    return summary;
  }, {
    healthy: 0,
    degraded: 0,
    failed: 0,
    stalled: 0,
    running: 0,
    never: 0,
  } as Record<SystemHealthStatus, number>);
}

export function healthStatusFromCounts(input: {
  hasHistory: boolean;
  running?: number;
  stalled?: number;
  failed?: number;
  retrying?: number;
}): SystemHealthStatus {
  if ((input.stalled || 0) > 0) return 'stalled';
  if ((input.failed || 0) > 0) return 'degraded';
  if ((input.retrying || 0) > 0) return 'degraded';
  if ((input.running || 0) > 0) return 'running';
  return input.hasHistory ? 'healthy' : 'never';
}
