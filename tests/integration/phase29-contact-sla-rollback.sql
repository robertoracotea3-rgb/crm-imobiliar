\set ON_ERROR_STOP on

do $test$
begin
  if to_regprocedure('public.crm_process_contact_sla(timestamp with time zone,uuid)') is not null then
    raise exception 'contact_sla_processor_remained_after_rollback';
  end if;
  if to_regprocedure('public.crm_contact_sla_dashboard(uuid,uuid,boolean,timestamp with time zone,timestamp with time zone)') is not null then
    raise exception 'contact_sla_dashboard_remained_after_rollback';
  end if;
  if exists (
    select 1
    from pg_trigger
    where tgname in (
      'zz_crm_prepare_lead_contact_sla_trigger',
      'crm_notify_lead_assignment_trigger'
    )
      and not tgisinternal
  ) then
    raise exception 'contact_sla_trigger_remained_after_rollback';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'contact_sla_status'
  ) then
    raise exception 'rollback_deleted_contact_sla_evidence';
  end if;
end
$test$;

select 'phase29_contact_sla_rollback_ok' as result;
