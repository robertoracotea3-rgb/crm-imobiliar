\set ON_ERROR_STOP on

do $test$
begin
  if exists (
    select 1
    from pg_trigger
    where tgname = 'crm_validate_lead_assignment_trigger'
      and not tgisinternal
  ) then
    raise exception 'storia_lead_assignment_trigger_remained_after_rollback';
  end if;
  if to_regprocedure('public.crm_validate_lead_assignment()') is not null then
    raise exception 'storia_lead_assignment_function_remained_after_rollback';
  end if;
  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'leads'
      and column_name = 'property_public_url'
  ) then
    raise exception 'rollback_deleted_snapshot_columns';
  end if;
end
$test$;

select 'phase28_storia_lead_assignment_rollback_ok' as result;
