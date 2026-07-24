\set ON_ERROR_STOP on

do $test$
begin
  if to_regprocedure(
    'public.crm_transition_contact_lifecycle(uuid,uuid,uuid,text,text,text)'
  ) is not null then
    raise exception 'contact_lifecycle_rpc_remained_after_rollback';
  end if;
  if exists (
    select 1 from pg_trigger
    where tgname in (
      'crm_guard_contact_lifecycle_update_trigger',
      'crm_record_initial_contact_lifecycle_trigger',
      'crm_reactivate_contact_from_new_lead_trigger',
      'crm_sync_contact_from_interaction_trigger',
      'crm_activate_contact_from_demand_trigger',
      'crm_activate_contact_from_viewing_trigger',
      'crm_activate_contact_from_transaction_trigger'
    )
      and not tgisinternal
  ) then
    raise exception 'contact_lifecycle_trigger_remained_after_rollback';
  end if;
  if to_regclass('public.contact_lifecycle_events') is null then
    raise exception 'rollback_deleted_contact_lifecycle_history';
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public'
      and table_name='contacts'
      and column_name='lifecycle_status'
  ) then
    raise exception 'rollback_deleted_contact_lifecycle_state';
  end if;
end
$test$;

select 'phase31_contact_lifecycle_rollback_ok' as result;
