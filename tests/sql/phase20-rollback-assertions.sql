do $$
begin
  if to_regprocedure('public.crm_dashboard_kpis(uuid,uuid,boolean,timestamptz,timestamptz)') is not null then
    raise exception 'dashboard function survived rollback';
  end if;
end
$$;
select 'phase20 rollback assertions passed' as result;
