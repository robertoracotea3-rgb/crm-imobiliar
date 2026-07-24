\set ON_ERROR_STOP on

do $test$
begin
  if to_regprocedure(
    'public.crm_review_demand(uuid,uuid,uuid,text,text,text,text,timestamp with time zone,text)'
  ) is not null then
    raise exception 'demand_review_rpc_remained_after_rollback';
  end if;
  if to_regprocedure(
    'public.crm_mark_demands_for_review(timestamp with time zone,uuid,integer)'
  ) is not null then
    raise exception 'demand_review_sweep_remained_after_rollback';
  end if;
  if exists (
    select 1 from pg_trigger
    where tgname in (
      'crm_notify_closed_demands_on_new_lead_trigger',
      'crm_prepare_demand_review_dates_trigger',
      'crm_guard_demand_review_status_trigger'
    )
      and not tgisinternal
  ) then
    raise exception 'demand_review_trigger_remained_after_rollback';
  end if;
  if to_regclass('public.demand_review_events') is null then
    raise exception 'rollback_deleted_demand_review_history';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='demands'
      and column_name='close_reason_code'
  ) then
    raise exception 'rollback_deleted_demand_closure_evidence';
  end if;
end
$test$;

select 'phase32_demand_review_rollback_ok' as result;
