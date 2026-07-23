do $$
declare
  agency_a uuid := '10000000-0000-0000-0000-000000000001';
  agent_a uuid := '11000000-0000-0000-0000-000000000001';
  lead_id uuid;
  property_id uuid;
  viewing_id uuid;
  selected_job_id uuid;
  claimed integer;
begin
  if (select count(*) from public.automation_rules where agency_id=agency_a) <> 10 then
    raise exception 'ten default rules were not seeded';
  end if;
  if (select count(*) from public.automation_rules where agency_id='20000000-0000-0000-0000-000000000001') <> 10 then
    raise exception 'rules were not tenant seeded';
  end if;

  insert into public.leads(
    agency_id,agent_id,assigned_to,contact_name,pipeline_stage,pipeline_stage_changed_at,
    received_at,created_at,next_action_at
  ) values (
    agency_a,agent_a,agent_a,'Client automatizare','lead_nou',now()-interval '2 days',
    now()-interval '2 days',now()-interval '2 days',null
  ) returning id into lead_id;
  if not exists(select 1 from public.automation_events where trigger_key='lead.created' and entity_id=lead_id::text) then
    raise exception 'new lead event missing';
  end if;
  if not exists(select 1 from public.automation_jobs j join public.automation_rules r on r.id=j.rule_id
    where r.rule_key='lead_new' and j.agency_id=agency_a) then
    raise exception 'new lead job missing';
  end if;

  perform public.crm_sweep_due_automations(now(),agency_a);
  perform public.crm_sweep_due_automations(now(),agency_a);
  if (select count(*) from public.automation_events
      where agency_id=agency_a and trigger_key='lead.unanswered' and entity_id=lead_id::text) <> 1 then
    raise exception 'scheduled lead event was not deduplicated';
  end if;
  if (select count(*) from public.automation_events
      where agency_id=agency_a and trigger_key='lead.missing_next_action' and entity_id=lead_id::text) <> 1 then
    raise exception 'missing next action event was not deduplicated';
  end if;

  update public.automation_rules set is_enabled=false where agency_id=agency_a and rule_key='listing_error';
  insert into public.properties(agency_id,agent_id,title,status)
  values(agency_a,agent_a,'Proprietate automatizare','activa') returning id into property_id;
  insert into public.portal_listings(agency_id,property_id,status,error_message)
  values(agency_a,property_id,'error','Eroare simulată');
  if exists(select 1 from public.automation_jobs j join public.automation_rules r on r.id=j.rule_id
    where r.rule_key='listing_error' and j.agency_id=agency_a) then
    raise exception 'disabled rule created a job';
  end if;

  insert into public.calendar_events(
    agency_id,agent_id,lead_id,property_id,title,type,status,start_at
  ) values (
    agency_a,agent_a,lead_id,property_id,'Vizionare test','vizionare','programata',now()+interval '1 hour'
  ) returning id into viewing_id;
  perform public.crm_sweep_due_automations(now(),agency_a);
  update public.calendar_events set status='efectuata',completed_at=now(),outcome='Interesat'
  where id=viewing_id;
  if not exists(select 1 from public.automation_events where trigger_key='viewing.completed' and entity_id=viewing_id::text) then
    raise exception 'viewing completion event missing';
  end if;

  update public.properties set status='tranzactionata' where id=property_id;
  if not exists(select 1 from public.automation_events where trigger_key='property.sold' and entity_id=property_id::text) then
    raise exception 'sold property event missing';
  end if;

  select count(*) into claimed from public.crm_claim_automation_jobs(100,agency_a);
  if claimed < 6 then raise exception 'due jobs were not claimed: %',claimed; end if;
  select id into selected_job_id from public.automation_jobs where agency_id=agency_a and status='processing' limit 1;
  if public.crm_finish_automation_job(selected_job_id,false,'{}','simulated failure',10) <> 'retry' then
    raise exception 'failed attempt was not scheduled for retry';
  end if;
  if not exists(select 1 from public.automation_run_logs l where l.job_id=selected_job_id and l.status='retry') then
    raise exception 'retry log missing';
  end if;
  update public.automation_jobs set run_after=now()-interval '1 minute' where id=selected_job_id;
  perform 1 from public.crm_claim_automation_jobs(1,agency_a) c where c.id=selected_job_id;
  if public.crm_finish_automation_job(selected_job_id,true,'{"ok":true}','',5) <> 'completed' then
    raise exception 'successful retry was not completed';
  end if;
  if (select count(*) from public.automation_run_logs l where l.job_id=selected_job_id) <> 2 then
    raise exception 'attempt history is incomplete';
  end if;
end
$$;

select 'phase19 assertions passed' as result;
