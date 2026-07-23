\set ON_ERROR_STOP on

do $$
declare
  agency uuid := '26000000-0000-4000-8000-000000000001';
  account uuid := '26000000-0000-4000-8000-000000000002';
  failed_run uuid;
  stalled_run uuid;
  global_run uuid;
  marked integer;
begin
  delete from public.crm_system_operation_runs where agency_id = agency;
  delete from public.crm_system_service_health where agency_id = agency;
  delete from public.profiles where user_id = account;
  delete from auth.users where id = account;
  delete from public.agencies where id = agency;

  insert into public.agencies(id, name) values (agency, 'Phase 26 Agency');
  insert into auth.users(id, email) values (account, 'phase26@fortis.crm');
  insert into public.profiles(user_id, agency_id, role, status)
  values (account, agency, 'owner', 'active');

  failed_run := public.crm_start_system_operation(
    agency, 'api', 'integration_check', 'api', 'phase26-failed',
    '/api/test', 'GET', '{"safe":true}'::jsonb
  );
  if not exists(
    select 1 from public.crm_system_service_health
    where agency_id = agency and service_code = 'api' and status = 'running'
  ) then
    raise exception 'Starting an operation did not mark health as running';
  end if;

  if not public.crm_finish_system_operation(
    failed_run, 'failed', 503, 1, 0, 1, 2,
    'database_unavailable', 'Eroare controlată.', now() + interval '5 minutes',
    '{"retryable":true}'::jsonb
  ) then
    raise exception 'Failed operation could not be completed';
  end if;
  if not exists(
    select 1 from public.crm_system_service_health
    where agency_id = agency
      and service_code = 'api'
      and status = 'failed'
      and last_error_code = 'database_unavailable'
      and retry_count = 2
  ) then
    raise exception 'Failed operation did not update service health';
  end if;

  stalled_run := public.crm_start_system_operation(
    agency, 'automations', 'stalled_check', 'cron', null,
    '/api/cron/automations', 'GET', '{}'::jsonb
  );
  update public.crm_system_operation_runs
  set started_at = now() - interval '20 minutes'
  where id = stalled_run;
  marked := public.crm_mark_stalled_system_operations(interval '10 minutes');
  if marked < 1 or not exists(
    select 1 from public.crm_system_operation_runs
    where id = stalled_run and status = 'stalled' and error_code = 'operation_stalled'
  ) or not exists(
    select 1 from public.crm_system_service_health
    where agency_id = agency and service_code = 'automations' and status = 'stalled'
  ) then
    raise exception 'Stalled operation was not detected';
  end if;

  global_run := public.crm_record_system_failure(
    null, 'api', 'unhandled_server_error', 'api',
    'next_unhandled_error', 'Mesaj sigur.', '/api/test', 'POST', 500,
    '{"route_type":"route"}'::jsonb
  );
  if not exists(
    select 1 from public.crm_system_operation_runs
    where id = global_run and agency_id is null and status = 'failed'
  ) then
    raise exception 'Platform error was not persisted without tenant leakage';
  end if;

  if has_table_privilege('authenticated', 'public.crm_system_operation_runs', 'select')
    or has_table_privilege('authenticated', 'public.crm_system_service_health', 'select') then
    raise exception 'Authenticated role can read observability internals directly';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.crm_record_system_failure(uuid,text,text,text,text,text,text,text,integer,jsonb)',
    'execute'
  ) then
    raise exception 'Authenticated role can forge system observations';
  end if;
end
$$;

select 'phase26_observability_ok';
