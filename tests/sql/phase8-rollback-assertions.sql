do $$
begin
  if to_regprocedure('public.crm_queue_property_matching()') is not null then raise exception 'queue trigger function survived rollback'; end if;
  if (select count(*) from public.matches where id = '61000000-0000-0000-0000-000000000001') <> 1 then raise exception 'rollback deleted match history'; end if;
  if exists(select 1 from public.demand_match_refresh_queue where status = 'pending') then raise exception 'pending jobs stayed active after rollback'; end if;
  if (select count(*) from public.demands where intent = 'cumparare') < 1 then raise exception 'rollback deleted normalized demand data'; end if;
end $$;
