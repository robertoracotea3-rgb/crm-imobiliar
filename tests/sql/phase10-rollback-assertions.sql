do $$
begin
  if to_regclass('public.lead_statuses') is null or to_regclass('public.crm_normalization_runs') is null then
    raise exception 'audit catalogs were destroyed by rollback';
  end if;
  if exists (select 1 from pg_trigger where tgname like 'enforce_%_status_transition' and not tgisinternal) then
    raise exception 'status enforcement trigger remained after rollback';
  end if;
  if (select status from public.leads where id='51000000-0000-0000-0000-000000000002') <> 'replied' then
    raise exception 'legacy lead status was not restored';
  end if;
  if (select status from public.properties where id='51000000-0000-0000-0000-000000000010') <> 'active' then
    raise exception 'legacy property status was not restored';
  end if;
  if (select status from public.calendar_events where id='51000000-0000-0000-0000-000000000020') is not null then
    raise exception 'legacy null viewing status was not restored';
  end if;
  if (select source from public.leads where id='51000000-0000-0000-0000-000000000001') <> 'Storia.ro + Olx.ro' then
    raise exception 'source history changed during rollback';
  end if;
end $$;

select 'phase10 rollback assertions passed' as result;
