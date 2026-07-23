do $$
begin
  if to_regprocedure('public.crm_transition_lead_pipeline(uuid,uuid,uuid,text,timestamptz,text,text,text)') is not null then
    raise exception 'pipeline transition function survived rollback';
  end if;
  if not exists(select 1 from public.lead_pipeline_events where source='manual') then
    raise exception 'rollback destroyed operational pipeline history';
  end if;
  if not exists(select 1 from public.lead_property_shares) then
    raise exception 'rollback destroyed property share evidence';
  end if;
  if (select status from public.leads
      where id='aaaaaaaa-4000-0000-0000-000000000001')<>'new' then
    raise exception 'rollback changed historical status';
  end if;
end
$$;

select 'phase18 rollback assertions passed' as result;
