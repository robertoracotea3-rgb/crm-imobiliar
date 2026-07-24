\set ON_ERROR_STOP on

do $test$
begin
  if to_regprocedure(
    'public.crm_assign_properties(uuid,uuid,uuid[],uuid,text,boolean,boolean,boolean,boolean,boolean)'
  ) is not null then
    raise exception 'assignment_rpc_not_removed';
  end if;
  if to_regclass('public.property_assignment_history') is null then
    raise exception 'assignment_history_was_destroyed';
  end if;
end
$test$;

select 'phase27_property_assignment_rollback_ok' as result;
