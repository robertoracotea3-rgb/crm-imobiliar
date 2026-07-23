do $$
declare owner_result jsonb; agent_result jsonb; rejected boolean:=false;
begin
  owner_result:=public.crm_dashboard_kpis(
    '10000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000001',true,now()-interval '30 days',now()+interval '1 minute'
  );
  if owner_result->>'scope'<>'agency' then raise exception 'owner scope incorrect'; end if;
  if (owner_result#>>'{kpis,new_leads}')::int<>3 then raise exception 'owner leads incorrect'; end if;
  if (owner_result#>>'{kpis,uncontacted_leads}')::int<>1 then raise exception 'uncontacted incorrect'; end if;
  if (owner_result#>>'{kpis,average_response_minutes}')::numeric<>45 then raise exception 'response average incorrect: %',owner_result#>>'{kpis,average_response_minutes}'; end if;
  if (owner_result#>>'{kpis,viewings}')::int<>1
    or (owner_result#>>'{kpis,offers}')::int<>1
    or (owner_result#>>'{kpis,reservations}')::int<>1
    or (owner_result#>>'{kpis,transactions}')::int<>1 then
    raise exception 'period funnel KPIs incorrect';
  end if;
  if (owner_result#>>'{kpis,active_properties}')::int<>1
    or (owner_result#>>'{kpis,expired_properties}')::int<>1
    or (owner_result#>>'{kpis,listing_errors}')::int<>1 then
    raise exception 'stock KPIs incorrect';
  end if;
  if (owner_result#>>'{revenue_by_currency,0,amount}')::numeric<>1000
    or (owner_result#>>'{estimated_commission_by_currency,0,amount}')::numeric<>2000 then
    raise exception 'owner money KPIs incorrect';
  end if;
  if jsonb_array_length(owner_result->'agent_performance')<>2 then
    raise exception 'agent performance is not complete';
  end if;

  -- Even with p_scope_all=true, an agent is forced to own rows.
  agent_result:=public.crm_dashboard_kpis(
    '10000000-0000-0000-0000-000000000001',
    '11000000-0000-0000-0000-000000000002',true,now()-interval '30 days',now()+interval '1 minute'
  );
  if agent_result->>'scope'<>'mine' then raise exception 'agent escalated dashboard scope'; end if;
  if (agent_result#>>'{kpis,new_leads}')::int<>2
    or (agent_result#>>'{kpis,active_properties}')::int<>1
    or (agent_result#>>'{kpis,expired_properties}')::int<>0
    or (agent_result#>>'{kpis,listing_errors}')::int<>0
    or (agent_result#>>'{kpis,open_tasks}')::int<>1 then
    raise exception 'agent scoped KPIs incorrect';
  end if;
  if (agent_result#>>'{revenue_by_currency,0,amount}')::numeric<>300
    or (agent_result#>>'{estimated_commission_by_currency,0,amount}')::numeric<>500 then
    raise exception 'agent money KPIs incorrect';
  end if;

  begin
    perform public.crm_dashboard_kpis(
      '10000000-0000-0000-0000-000000000001',
      '22000000-0000-0000-0000-000000000001',true,now()-interval '30 days',now()
    );
  exception when others then rejected:=sqlerrm='dashboard_profile_not_found'; end;
  if not rejected then raise exception 'cross-tenant user accepted'; end if;
end
$$;
select 'phase20 assertions passed' as result;
