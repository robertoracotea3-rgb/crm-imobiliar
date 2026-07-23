-- Phase 26: shared service health and operation telemetry.
-- Additive and idempotent. Raw request bodies, headers and credentials are forbidden.

begin;

create extension if not exists pgcrypto;

create table if not exists public.crm_system_operation_runs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  service_code text not null
    check (service_code ~ '^[a-z][a-z0-9_.:-]{1,79}$'),
  operation text not null
    check (operation ~ '^[a-z][a-z0-9_.:-]{1,79}$'),
  trigger_type text not null default 'system'
    check (trigger_type in ('api', 'cron', 'webhook', 'manual', 'system')),
  correlation_key text,
  status text not null default 'running'
    check (status in ('running', 'succeeded', 'degraded', 'failed', 'stalled', 'cancelled')),
  route text,
  method text,
  http_status integer check (http_status is null or http_status between 100 and 599),
  processed_count integer not null default 0 check (processed_count >= 0),
  success_count integer not null default 0 check (success_count >= 0),
  error_count integer not null default 0 check (error_count >= 0),
  retry_count integer not null default 0 check (retry_count >= 0),
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_crm_system_runs_agency_time
  on public.crm_system_operation_runs(agency_id, started_at desc)
  where agency_id is not null;
create index if not exists idx_crm_system_runs_service_time
  on public.crm_system_operation_runs(service_code, started_at desc);
create index if not exists idx_crm_system_runs_running
  on public.crm_system_operation_runs(started_at)
  where status = 'running';
create index if not exists idx_crm_system_runs_failures
  on public.crm_system_operation_runs(agency_id, started_at desc)
  where status in ('failed', 'stalled');

create table if not exists public.crm_system_service_health (
  agency_id uuid not null references public.agencies(id) on delete cascade,
  service_code text not null
    check (service_code ~ '^[a-z][a-z0-9_.:-]{1,79}$'),
  status text not null default 'never'
    check (status in ('never', 'running', 'healthy', 'degraded', 'failed', 'stalled')),
  last_run_id uuid references public.crm_system_operation_runs(id) on delete set null,
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  last_error_message text,
  last_duration_ms integer check (last_duration_ms is null or last_duration_ms >= 0),
  next_run_at timestamptz,
  retry_count integer not null default 0 check (retry_count >= 0),
  consecutive_failures integer not null default 0 check (consecutive_failures >= 0),
  metrics jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (agency_id, service_code)
);

create index if not exists idx_crm_system_health_status
  on public.crm_system_service_health(agency_id, status, updated_at desc);

create or replace function public.crm_start_system_operation(
  p_agency_id uuid,
  p_service_code text,
  p_operation text,
  p_trigger_type text default 'system',
  p_correlation_key text default null,
  p_route text default null,
  p_method text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  run_id uuid;
begin
  if p_service_code !~ '^[a-z][a-z0-9_.:-]{1,79}$'
    or p_operation !~ '^[a-z][a-z0-9_.:-]{1,79}$'
    or p_trigger_type not in ('api', 'cron', 'webhook', 'manual', 'system')
    or pg_column_size(coalesce(p_metadata, '{}'::jsonb)) > 16384 then
    raise exception 'invalid_system_operation';
  end if;

  insert into public.crm_system_operation_runs(
    agency_id, service_code, operation, trigger_type, correlation_key,
    route, method, metadata
  )
  values (
    p_agency_id, p_service_code, p_operation, p_trigger_type,
    left(nullif(p_correlation_key, ''), 160),
    left(nullif(p_route, ''), 300),
    left(upper(nullif(p_method, '')), 12),
    coalesce(p_metadata, '{}'::jsonb)
  )
  returning id into run_id;

  if p_agency_id is not null then
    insert into public.crm_system_service_health(
      agency_id, service_code, status, last_run_id, last_started_at, updated_at
    )
    values (p_agency_id, p_service_code, 'running', run_id, now(), now())
    on conflict (agency_id, service_code) do update set
      status = 'running',
      last_run_id = excluded.last_run_id,
      last_started_at = excluded.last_started_at,
      updated_at = now();
  end if;

  return run_id;
end;
$$;

create or replace function public.crm_finish_system_operation(
  p_run_id uuid,
  p_status text,
  p_http_status integer default null,
  p_processed_count integer default 0,
  p_success_count integer default 0,
  p_error_count integer default 0,
  p_retry_count integer default 0,
  p_error_code text default null,
  p_error_message text default null,
  p_next_run_at timestamptz default null,
  p_metadata jsonb default '{}'::jsonb
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  run_row public.crm_system_operation_runs%rowtype;
  health_status text;
  finished timestamptz := now();
begin
  if p_status not in ('succeeded', 'degraded', 'failed', 'stalled', 'cancelled')
    or coalesce(p_processed_count, 0) < 0
    or coalesce(p_success_count, 0) < 0
    or coalesce(p_error_count, 0) < 0
    or coalesce(p_retry_count, 0) < 0
    or (p_http_status is not null and p_http_status not between 100 and 599)
    or pg_column_size(coalesce(p_metadata, '{}'::jsonb)) > 16384 then
    raise exception 'invalid_system_operation_result';
  end if;

  select * into run_row
  from public.crm_system_operation_runs
  where id = p_run_id
  for update;
  if not found or run_row.status <> 'running' then return false; end if;

  update public.crm_system_operation_runs
  set status = p_status,
      http_status = p_http_status,
      processed_count = coalesce(p_processed_count, 0),
      success_count = coalesce(p_success_count, 0),
      error_count = coalesce(p_error_count, 0),
      retry_count = coalesce(p_retry_count, 0),
      error_code = left(nullif(p_error_code, ''), 120),
      error_message = left(nullif(p_error_message, ''), 500),
      metadata = coalesce(p_metadata, '{}'::jsonb),
      finished_at = finished,
      duration_ms = greatest(0, floor(extract(epoch from (finished - started_at)) * 1000)::integer)
  where id = p_run_id;

  if run_row.agency_id is null then return true; end if;
  health_status := case p_status
    when 'succeeded' then 'healthy'
    when 'degraded' then 'degraded'
    when 'stalled' then 'stalled'
    when 'failed' then 'failed'
    else 'degraded'
  end;

  insert into public.crm_system_service_health(
    agency_id, service_code, status, last_run_id, last_started_at,
    last_success_at, last_error_at, last_error_code, last_error_message,
    last_duration_ms, next_run_at, retry_count, consecutive_failures,
    metrics, updated_at
  )
  values (
    run_row.agency_id, run_row.service_code, health_status, run_row.id,
    run_row.started_at,
    case when p_status = 'succeeded' then finished end,
    case when p_status in ('failed', 'stalled', 'degraded') then finished end,
    case when p_status in ('failed', 'stalled', 'degraded')
      then left(nullif(p_error_code, ''), 120) end,
    case when p_status in ('failed', 'stalled', 'degraded')
      then left(nullif(p_error_message, ''), 500) end,
    greatest(0, floor(extract(epoch from (finished - run_row.started_at)) * 1000)::integer),
    p_next_run_at, coalesce(p_retry_count, 0),
    case when p_status in ('failed', 'stalled') then 1 else 0 end,
    coalesce(p_metadata, '{}'::jsonb), finished
  )
  on conflict (agency_id, service_code) do update set
    status = excluded.status,
    last_run_id = excluded.last_run_id,
    last_started_at = excluded.last_started_at,
    last_success_at = coalesce(excluded.last_success_at, public.crm_system_service_health.last_success_at),
    last_error_at = coalesce(excluded.last_error_at, public.crm_system_service_health.last_error_at),
    last_error_code = coalesce(excluded.last_error_code, public.crm_system_service_health.last_error_code),
    last_error_message = coalesce(excluded.last_error_message, public.crm_system_service_health.last_error_message),
    last_duration_ms = excluded.last_duration_ms,
    next_run_at = excluded.next_run_at,
    retry_count = excluded.retry_count,
    consecutive_failures = case
      when p_status in ('failed', 'stalled')
        then public.crm_system_service_health.consecutive_failures + 1
      else 0
    end,
    metrics = excluded.metrics,
    updated_at = excluded.updated_at;

  return true;
end;
$$;

create or replace function public.crm_record_system_failure(
  p_agency_id uuid,
  p_service_code text,
  p_operation text,
  p_trigger_type text,
  p_error_code text,
  p_error_message text,
  p_route text default null,
  p_method text default null,
  p_http_status integer default 500,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  run_id uuid;
begin
  run_id := public.crm_start_system_operation(
    p_agency_id, p_service_code, p_operation, p_trigger_type,
    null, p_route, p_method, p_metadata
  );
  perform public.crm_finish_system_operation(
    run_id, 'failed', p_http_status, 0, 0, 1, 0,
    p_error_code, p_error_message, null, p_metadata
  );
  return run_id;
end;
$$;

create or replace function public.crm_mark_stalled_system_operations(
  p_threshold interval default interval '10 minutes'
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  stalled_run public.crm_system_operation_runs%rowtype;
  affected integer := 0;
begin
  if p_threshold < interval '1 minute' or p_threshold > interval '1 day' then
    raise exception 'invalid_stalled_threshold';
  end if;

  for stalled_run in
    update public.crm_system_operation_runs
    set status = 'stalled',
        finished_at = now(),
        duration_ms = greatest(0, floor(extract(epoch from (now() - started_at)) * 1000)::integer),
        error_count = greatest(error_count, 1),
        error_code = 'operation_stalled',
        error_message = 'Operațiunea nu a raportat finalizarea în intervalul așteptat.'
    where status = 'running'
      and started_at <= now() - p_threshold
    returning *
  loop
    affected := affected + 1;
    if stalled_run.agency_id is not null then
      insert into public.crm_system_service_health(
        agency_id, service_code, status, last_run_id, last_started_at,
        last_error_at, last_error_code, last_error_message, last_duration_ms,
        consecutive_failures, updated_at
      )
      values (
        stalled_run.agency_id, stalled_run.service_code, 'stalled',
        stalled_run.id, stalled_run.started_at, now(), 'operation_stalled',
        'Operațiunea nu a raportat finalizarea în intervalul așteptat.',
        stalled_run.duration_ms, 1, now()
      )
      on conflict (agency_id, service_code) do update set
        status = 'stalled',
        last_run_id = excluded.last_run_id,
        last_started_at = excluded.last_started_at,
        last_error_at = excluded.last_error_at,
        last_error_code = excluded.last_error_code,
        last_error_message = excluded.last_error_message,
        last_duration_ms = excluded.last_duration_ms,
        consecutive_failures = public.crm_system_service_health.consecutive_failures + 1,
        updated_at = now();
    end if;
  end loop;
  return affected;
end;
$$;

alter table public.crm_system_operation_runs enable row level security;
alter table public.crm_system_service_health enable row level security;

revoke all on public.crm_system_operation_runs, public.crm_system_service_health
  from public, anon, authenticated;
grant all on public.crm_system_operation_runs, public.crm_system_service_health
  to service_role;

revoke all on function public.crm_start_system_operation(
  uuid, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.crm_finish_system_operation(
  uuid, text, integer, integer, integer, integer, integer,
  text, text, timestamptz, jsonb
) from public, anon, authenticated;
revoke all on function public.crm_record_system_failure(
  uuid, text, text, text, text, text, text, text, integer, jsonb
) from public, anon, authenticated;
revoke all on function public.crm_mark_stalled_system_operations(interval)
  from public, anon, authenticated;

grant execute on function public.crm_start_system_operation(
  uuid, text, text, text, text, text, text, jsonb
) to service_role;
grant execute on function public.crm_finish_system_operation(
  uuid, text, integer, integer, integer, integer, integer,
  text, text, timestamptz, jsonb
) to service_role;
grant execute on function public.crm_record_system_failure(
  uuid, text, text, text, text, text, text, text, integer, jsonb
) to service_role;
grant execute on function public.crm_mark_stalled_system_operations(interval)
  to service_role;

comment on table public.crm_system_operation_runs is
  'Sanitized, tenant-aware operation telemetry. Never store request bodies, headers or credentials.';
comment on table public.crm_system_service_health is
  'Latest health state per agency and service, derived from durable operation runs.';

commit;
