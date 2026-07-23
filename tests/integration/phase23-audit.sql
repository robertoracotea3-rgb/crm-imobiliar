\set ON_ERROR_STOP on

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000022','audit-agent@example.invalid')
on conflict (id) do nothing;
insert into public.agencies(id,name) values
  ('00000000-0000-4000-8000-000000000011','Audit Test Agency')
on conflict (id) do nothing;
insert into public.profiles(user_id,agency_id,status) values
  ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000011','active')
on conflict (user_id,agency_id) do nothing;

do $$
declare
  first_id uuid;
  second_id uuid;
  first_event public.crm_audit_log%rowtype;
  second_event public.crm_audit_log%rowtype;
  integrity jsonb;
begin
  first_id := public.crm_append_audit_event(
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000022',
    'owner',
    'auth.login',
    'session',
    '00000000-0000-4000-8000-000000000022',
    '{"password":"must-not-survive","nested":{"access_token":"hidden"}}'::jsonb,
    '{"authenticated":true}'::jsonb,
    'success',
    null,
    '/api/auth/audit',
    repeat('a', 64),
    'Synthetic test agent',
    'phase23-request-1',
    '{"refresh_token":"must-not-survive"}'::jsonb
  );

  second_id := public.crm_append_audit_event(
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000022',
    'owner',
    'transaction.commission_changed',
    'transaction',
    '00000000-0000-4000-8000-000000000077',
    '{"agency_commission":1000}'::jsonb,
    '{"agency_commission":1200}'::jsonb,
    'success',
    'Synthetic approved change',
    '/api/transactions',
    null,
    'Synthetic test agent',
    'phase23-request-2',
    '{}'::jsonb
  );

  select * into first_event from public.crm_audit_log where id = first_id;
  select * into second_event from public.crm_audit_log where id = second_id;

  if first_event.before_values ->> 'password' <> '[REDACTED]'
    or first_event.before_values #>> '{nested,access_token}' <> '[REDACTED]'
    or first_event.metadata ->> 'refresh_token' <> '[REDACTED]' then
    raise exception 'audit secrets were not redacted';
  end if;
  if first_event.ip_hash <> repeat('a', 64) then
    raise exception 'audit IP hash was not preserved';
  end if;
  if second_event.previous_hash <> first_event.event_hash then
    raise exception 'audit chain did not link consecutive events';
  end if;
  if length(first_event.event_hash) <> 64 or length(second_event.event_hash) <> 64 then
    raise exception 'audit hash has an invalid format';
  end if;

  integrity := public.crm_verify_audit_chain('00000000-0000-4000-8000-000000000011');
  if not coalesce((integrity ->> 'valid')::boolean, false)
    or (integrity ->> 'checked')::integer <> 2 then
    raise exception 'audit chain verification failed: %', integrity;
  end if;

  begin
    update public.crm_audit_log set reason = 'tampered' where id = first_id;
    raise exception 'audit update unexpectedly succeeded';
  exception
    when sqlstate '55000' then null;
  end;

  begin
    delete from public.crm_audit_log where id = second_id;
    raise exception 'audit delete unexpectedly succeeded';
  exception
    when sqlstate '55000' then null;
  end;

  if has_table_privilege('authenticated', 'public.crm_audit_log', 'INSERT')
    or has_table_privilege('authenticated', 'public.crm_audit_log', 'UPDATE')
    or has_table_privilege('authenticated', 'public.crm_audit_log', 'DELETE') then
    raise exception 'authenticated role can mutate the audit table';
  end if;
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'crm_append_audit_event'
      and has_function_privilege('authenticated', p.oid, 'EXECUTE')
  ) then
    raise exception 'authenticated role can call the privileged audit writer';
  end if;
end
$$;

select 'phase23_audit_integration_ok' as marker;
