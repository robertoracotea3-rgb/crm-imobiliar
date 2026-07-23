\set ON_ERROR_STOP on

do $$
declare
  event_id uuid;
begin
  if to_regclass('public.crm_audit_log') is null
    or (select count(*) from public.crm_audit_log) <> 2 then
    raise exception 'audit rollback deleted historical evidence';
  end if;
  if has_table_privilege('authenticated', 'public.crm_audit_log', 'SELECT') then
    raise exception 'audit rollback left application read access enabled';
  end if;
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'crm_append_audit_event'
      and has_function_privilege('service_role', p.oid, 'EXECUTE')
  ) then
    raise exception 'audit rollback left the application writer enabled';
  end if;

  select id into event_id from public.crm_audit_log order by sequence_no limit 1;
  begin
    delete from public.crm_audit_log where id = event_id;
    raise exception 'rollback removed audit immutability';
  exception
    when sqlstate '55000' then null;
  end;
end
$$;

select 'phase23_audit_rollback_ok' as marker;
