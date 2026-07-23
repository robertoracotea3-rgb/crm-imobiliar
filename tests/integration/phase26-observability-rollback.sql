\set ON_ERROR_STOP on

do $$
begin
  if to_regprocedure(
    'public.crm_start_system_operation(uuid,text,text,text,text,text,text,jsonb)'
  ) is not null
    or to_regprocedure(
      'public.crm_finish_system_operation(uuid,text,integer,integer,integer,integer,integer,text,text,timestamptz,jsonb)'
    ) is not null
    or to_regprocedure(
      'public.crm_record_system_failure(uuid,text,text,text,text,text,text,text,integer,jsonb)'
    ) is not null
    or to_regprocedure('public.crm_mark_stalled_system_operations(interval)') is not null then
    raise exception 'Observability write functions survived rollback';
  end if;
  if to_regclass('public.crm_system_operation_runs') is null
    or to_regclass('public.crm_system_service_health') is null then
    raise exception 'Observability history was destroyed by rollback';
  end if;
  if not exists(select 1 from public.crm_system_operation_runs) then
    raise exception 'Collected operation history was erased by rollback';
  end if;
end
$$;

select 'phase26_observability_rollback_ok';
