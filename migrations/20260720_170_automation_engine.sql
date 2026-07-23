begin;

-- Central registry: business rules are data, while source triggers only publish
-- immutable domain events. Actions are executed by the server worker.
create table if not exists public.automation_rules (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  rule_key text not null,
  name text not null,
  description text not null default '',
  trigger_key text not null,
  conditions jsonb not null default '{}'::jsonb,
  actions jsonb not null default '[]'::jsonb,
  config jsonb not null default '{}'::jsonb,
  is_enabled boolean not null default true,
  max_attempts integer not null default 5 check(max_attempts between 1 and 20),
  retry_delay_minutes integer not null default 15 check(retry_delay_minutes between 1 and 1440),
  last_run_at timestamptz,
  disabled_at timestamptz,
  disabled_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(agency_id,rule_key)
);

create table if not exists public.automation_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  trigger_key text not null,
  entity_type text not null,
  entity_id text not null,
  dedup_key text not null,
  payload jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  status text not null default 'pending'
    check(status in ('pending','queued','completed','ignored','failed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(agency_id,dedup_key)
);

create table if not exists public.automation_jobs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  event_id uuid not null references public.automation_events(id) on delete cascade,
  status text not null default 'pending'
    check(status in ('pending','processing','retry','completed','failed','cancelled')),
  attempts integer not null default 0,
  max_attempts integer not null default 5,
  run_after timestamptz not null default now(),
  locked_at timestamptz,
  completed_at timestamptz,
  last_error text,
  payload jsonb not null default '{}'::jsonb,
  result jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(rule_id,event_id)
);

create table if not exists public.automation_run_logs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  job_id uuid not null references public.automation_jobs(id) on delete cascade,
  rule_id uuid not null references public.automation_rules(id) on delete cascade,
  event_id uuid not null references public.automation_events(id) on delete cascade,
  attempt integer not null,
  status text not null check(status in ('completed','retry','failed','cancelled')),
  input jsonb not null default '{}'::jsonb,
  output jsonb not null default '{}'::jsonb,
  error_message text,
  duration_ms integer,
  created_at timestamptz not null default now(),
  unique(job_id,attempt)
);

alter table public.tasks add column if not exists automation_job_id uuid;
create unique index if not exists tasks_automation_job_uidx
  on public.tasks(automation_job_id) where automation_job_id is not null;

create index if not exists automation_rules_agency_idx
  on public.automation_rules(agency_id,is_enabled,trigger_key);
create index if not exists automation_events_status_idx
  on public.automation_events(status,occurred_at);
create index if not exists automation_jobs_due_idx
  on public.automation_jobs(status,run_after,created_at)
  where status in ('pending','retry','processing');
create index if not exists automation_jobs_agency_idx
  on public.automation_jobs(agency_id,created_at desc);
create index if not exists automation_logs_agency_idx
  on public.automation_run_logs(agency_id,created_at desc);

create or replace function public.crm_seed_automation_rules(p_agency_id uuid)
returns integer
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare changed integer;
begin
  if p_agency_id is null or not exists(select 1 from public.agencies where id=p_agency_id) then
    return 0;
  end if;

  insert into public.automation_rules(
    agency_id,rule_key,name,description,trigger_key,conditions,actions,config,max_attempts,retry_delay_minutes
  )
  select p_agency_id,v.rule_key,v.name,v.description,v.trigger_key,v.conditions,v.actions,
    v.config,v.max_attempts,v.retry_delay_minutes
  from (values
    ('lead_new','Lead nou → notificare agent',
      'Anunță imediat agentul responsabil când intră un lead nou.','lead.created',
      '{}'::jsonb,
      '[{"type":"notify","audience":"agent","notification_type":"new_lead","priority":"high","title":"Lead nou","action_url":"/clients/{entity_id}"}]'::jsonb,
      '{}'::jsonb,5,5),
    ('lead_unanswered','Lead fără răspuns → reminder',
      'Avertizează agentul când un lead nou nu are contact confirmat în intervalul stabilit.','lead.unanswered',
      '{"pipeline_stages":["lead_nou","de_contactat"]}'::jsonb,
      '[{"type":"notify","audience":"agent","notification_type":"lead_uncontacted","priority":"urgent","title":"Lead fără răspuns","action_url":"/clients/{entity_id}"}]'::jsonb,
      '{"delay_minutes":1440}'::jsonb,5,15),
    ('viewing_reminder','Vizionare programată → reminder',
      'Trimite reminder agentului înainte de vizionare.','viewing.reminder',
      '{"statuses":["programata","confirmata"]}'::jsonb,
      '[{"type":"notify","audience":"agent","notification_type":"viewing_reminder","priority":"high","title":"Vizionare programată","action_url":"/viewings"}]'::jsonb,
      '{"advance_minutes":120}'::jsonb,5,10),
    ('viewing_followup','Vizionare efectuată → task follow-up',
      'Creează sau confirmă existența taskului de revenire după vizionare.','viewing.completed',
      '{}'::jsonb,
      '[{"type":"create_followup_task","due_minutes":1440}]'::jsonb,
      '{}'::jsonb,5,15),
    ('demand_matching','Cerere nouă → matching',
      'Calculează proprietățile potrivite pentru o cerere nouă.','demand.created',
      '{"statuses":["activa"]}'::jsonb,
      '[{"type":"match_demand"}]'::jsonb,
      '{"minimum_score":30}'::jsonb,5,15),
    ('property_matching','Proprietate nouă → verificare cereri',
      'Verifică cererile active potrivite când apare o proprietate.','property.created',
      '{"statuses":["activa"]}'::jsonb,
      '[{"type":"match_property"}]'::jsonb,
      '{"minimum_score":40}'::jsonb,5,15),
    ('property_withdrawal','Proprietate vândută → retragere portaluri',
      'Retrage listările externe și confirmă rezultatul.','property.sold',
      '{"statuses":["tranzactionata","inchiriata"]}'::jsonb,
      '[{"type":"withdraw_property_portals"}]'::jsonb,
      '{}'::jsonb,8,30),
    ('listing_error','Listare cu eroare → notificare admin',
      'Notifică administratorii când publicarea sau retragerea eșuează.','listing.error',
      '{}'::jsonb,
      '[{"type":"notify","audience":"admins","notification_type":"portal_error","priority":"urgent","title":"Eroare listare portal","action_url":"/portals"}]'::jsonb,
      '{}'::jsonb,5,15),
    ('task_overdue','Task expirat → notificare',
      'Avertizează persoana responsabilă despre un task depășit.','task.overdue',
      '{"excluded_statuses":["done"]}'::jsonb,
      '[{"type":"notify","audience":"assigned","notification_type":"task_overdue","priority":"high","title":"Task expirat","action_url":"/tasks"}]'::jsonb,
      '{"grace_minutes":0}'::jsonb,5,15),
    ('lead_missing_next_action','Lead fără următoarea acțiune → alertă',
      'Avertizează agentul când un lead activ nu are următorul pas planificat.','lead.missing_next_action',
      '{"excluded_stages":["finalizat","pierdut"]}'::jsonb,
      '[{"type":"notify","audience":"agent","notification_type":"lead_missing_next_action","priority":"high","title":"Lead fără următoarea acțiune","action_url":"/clients/{entity_id}"}]'::jsonb,
      '{"grace_minutes":60}'::jsonb,5,15)
  ) as v(rule_key,name,description,trigger_key,conditions,actions,config,max_attempts,retry_delay_minutes)
  on conflict(agency_id,rule_key) do update set
    name=excluded.name,
    description=excluded.description,
    trigger_key=excluded.trigger_key,
    -- Preserve agency configuration and enabled state on repeatable migrations.
    conditions=case when public.automation_rules.conditions='{}'::jsonb
      then excluded.conditions else public.automation_rules.conditions end,
    actions=case when public.automation_rules.actions='[]'::jsonb
      then excluded.actions else public.automation_rules.actions end,
    updated_at=now();
  get diagnostics changed=row_count;
  return changed;
end
$$;

select public.crm_seed_automation_rules(id) from public.agencies;

create or replace function public.crm_seed_new_agency_automations()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  perform public.crm_seed_automation_rules(new.id);
  return new;
end
$$;

drop trigger if exists crm_seed_new_agency_automations_trigger on public.agencies;
create trigger crm_seed_new_agency_automations_trigger
after insert on public.agencies for each row execute function public.crm_seed_new_agency_automations();

create or replace function public.crm_dispatch_automation_event()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare queued integer;
begin
  insert into public.automation_jobs(
    agency_id,rule_id,event_id,max_attempts,payload
  )
  select new.agency_id,r.id,new.id,r.max_attempts,
    jsonb_build_object(
      'trigger_key',new.trigger_key,
      'entity_type',new.entity_type,
      'entity_id',new.entity_id,
      'event',new.payload,
      'actions',r.actions,
      'config',r.config,
      'conditions',r.conditions
    )
  from public.automation_rules r
  where r.agency_id=new.agency_id and r.trigger_key=new.trigger_key and r.is_enabled
  on conflict(rule_id,event_id) do nothing;
  get diagnostics queued=row_count;

  update public.automation_events
  set status=case when queued>0 then 'queued' else 'ignored' end,updated_at=now()
  where id=new.id;
  return new;
end
$$;

drop trigger if exists crm_dispatch_automation_event_trigger on public.automation_events;
create trigger crm_dispatch_automation_event_trigger
after insert on public.automation_events for each row execute function public.crm_dispatch_automation_event();

create or replace function public.crm_enqueue_automation_event(
  p_agency_id uuid,
  p_trigger_key text,
  p_entity_type text,
  p_entity_id text,
  p_dedup_key text,
  p_payload jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns uuid
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare event_id uuid;
begin
  if p_agency_id is null or nullif(trim(p_trigger_key),'') is null
    or nullif(trim(p_entity_id),'') is null or nullif(trim(p_dedup_key),'') is null then
    return null;
  end if;
  insert into public.automation_events(
    agency_id,trigger_key,entity_type,entity_id,dedup_key,payload,occurred_at
  ) values (
    p_agency_id,trim(p_trigger_key),trim(p_entity_type),trim(p_entity_id),
    left(trim(p_dedup_key),500),coalesce(p_payload,'{}'::jsonb),coalesce(p_occurred_at,now())
  )
  on conflict(agency_id,dedup_key) do update set
    payload=excluded.payload,updated_at=now()
  returning id into event_id;
  return event_id;
end
$$;

create or replace function public.crm_capture_automation_event()
returns trigger
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare
  event_key text := tg_argv[0];
  row_data jsonb := to_jsonb(new);
  old_data jsonb := case when tg_op='UPDATE' then to_jsonb(old) else '{}'::jsonb end;
  agency uuid := nullif(row_data->>'agency_id','')::uuid;
  entity_id text := row_data->>'id';
  relevant boolean := false;
  suffix text := '';
begin
  if event_key='lead.created' then
    relevant := tg_op='INSERT';
    suffix := entity_id;
  elsif event_key='viewing.completed' then
    relevant := tg_op='UPDATE' and row_data->>'type'='vizionare'
      and row_data->>'status'='efectuata' and old_data->>'status' is distinct from 'efectuata';
    suffix := entity_id||':'||coalesce(row_data->>'completed_at',row_data->>'updated_at','completed');
  elsif event_key='demand.created' then
    relevant := tg_op='INSERT';
    suffix := entity_id;
  elsif event_key='property.created' then
    relevant := row_data->>'status'='activa'
      and (tg_op='INSERT' or old_data->>'status' is distinct from 'activa')
      and coalesce((row_data->>'deleted_at') is null,true);
    suffix := entity_id;
  elsif event_key='property.sold' then
    relevant := tg_op='UPDATE' and row_data->>'status' in ('tranzactionata','inchiriata')
      and old_data->>'status' is distinct from row_data->>'status';
    suffix := entity_id||':'||(row_data->>'status');
  elsif event_key='listing.error' then
    relevant := row_data->>'status' in ('error','rejected','removal_failed')
      or nullif(row_data->>'error_message','') is not null;
    relevant := relevant and (
      tg_op='INSERT'
      or old_data->>'status' is distinct from row_data->>'status'
      or old_data->>'error_message' is distinct from row_data->>'error_message'
    );
    suffix := entity_id||':'||coalesce(row_data->>'status','error')||':'
      ||md5(coalesce(row_data->>'error_message',''));
  end if;
  if relevant then
    perform public.crm_enqueue_automation_event(
      agency,event_key,tg_table_name,entity_id,event_key||':'||suffix,
      jsonb_build_object('new',row_data,'old',old_data,'operation',tg_op),now()
    );
  end if;
  return new;
end
$$;

drop trigger if exists crm_automation_lead_created on public.leads;
create trigger crm_automation_lead_created
after insert on public.leads for each row
execute function public.crm_capture_automation_event('lead.created');

drop trigger if exists crm_automation_viewing_completed on public.calendar_events;
create trigger crm_automation_viewing_completed
after update of status on public.calendar_events for each row
execute function public.crm_capture_automation_event('viewing.completed');

drop trigger if exists crm_automation_demand_created on public.demands;
create trigger crm_automation_demand_created
after insert on public.demands for each row
execute function public.crm_capture_automation_event('demand.created');

drop trigger if exists crm_automation_property_created on public.properties;
create trigger crm_automation_property_created
after insert or update of status on public.properties for each row
execute function public.crm_capture_automation_event('property.created');

drop trigger if exists crm_automation_property_sold on public.properties;
create trigger crm_automation_property_sold
after update of status on public.properties for each row
execute function public.crm_capture_automation_event('property.sold');

drop trigger if exists crm_automation_listing_error on public.portal_listings;
create trigger crm_automation_listing_error
after insert or update of status,error_message on public.portal_listings for each row
execute function public.crm_capture_automation_event('listing.error');

-- Scheduled conditions live in this single sweep instead of UI components.
create or replace function public.crm_sweep_due_automations(
  p_now timestamptz default now(),
  p_agency_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare created_count integer := 0; n integer;
begin
  with candidates as (
    select l.*,r.config
    from public.leads l join public.automation_rules r
      on r.agency_id=l.agency_id and r.rule_key='lead_unanswered' and r.is_enabled
    where l.deleted_at is null
      and (p_agency_id is null or l.agency_id=p_agency_id)
      and l.pipeline_stage in ('lead_nou','de_contactat')
      and l.last_contacted_at is null and l.first_response_at is null
      and coalesce(l.received_at,l.created_at) <= p_now
        - make_interval(mins=>greatest(1,coalesce((r.config->>'delay_minutes')::integer,1440)))
  )
  insert into public.automation_events(agency_id,trigger_key,entity_type,entity_id,dedup_key,payload,occurred_at)
  select agency_id,'lead.unanswered','lead',id::text,
    'lead.unanswered:'||id::text||':'||extract(epoch from coalesce(received_at,created_at))::bigint,
    jsonb_build_object('lead',to_jsonb(candidates)),p_now
  from candidates on conflict(agency_id,dedup_key) do nothing;
  get diagnostics n=row_count; created_count:=created_count+n;

  with candidates as (
    select e.*,r.config
    from public.calendar_events e join public.automation_rules r
      on r.agency_id=e.agency_id and r.rule_key='viewing_reminder' and r.is_enabled
    where e.deleted_at is null and e.type='vizionare'
      and (p_agency_id is null or e.agency_id=p_agency_id)
      and e.status in ('programata','confirmata') and e.start_at>=p_now
      and e.start_at<=p_now+make_interval(mins=>greatest(1,coalesce((r.config->>'advance_minutes')::integer,120)))
  )
  insert into public.automation_events(agency_id,trigger_key,entity_type,entity_id,dedup_key,payload,occurred_at)
  select agency_id,'viewing.reminder','viewing',id::text,
    'viewing.reminder:'||id::text||':'||extract(epoch from start_at)::bigint,
    jsonb_build_object('viewing',to_jsonb(candidates)),p_now
  from candidates on conflict(agency_id,dedup_key) do nothing;
  get diagnostics n=row_count; created_count:=created_count+n;

  with candidates as (
    select t.*,r.config
    from public.tasks t join public.automation_rules r
      on r.agency_id=t.agency_id and r.rule_key='task_overdue' and r.is_enabled
    where t.deleted_at is null and t.status<>'done' and t.due_at is not null
      and (p_agency_id is null or t.agency_id=p_agency_id)
      and t.due_at+make_interval(mins=>greatest(0,coalesce((r.config->>'grace_minutes')::integer,0)))<=p_now
  )
  insert into public.automation_events(agency_id,trigger_key,entity_type,entity_id,dedup_key,payload,occurred_at)
  select agency_id,'task.overdue','task',id::text,
    'task.overdue:'||id::text||':'||extract(epoch from due_at)::bigint,
    jsonb_build_object('task',to_jsonb(candidates)),p_now
  from candidates on conflict(agency_id,dedup_key) do nothing;
  get diagnostics n=row_count; created_count:=created_count+n;

  with candidates as (
    select l.*,r.config
    from public.leads l join public.automation_rules r
      on r.agency_id=l.agency_id and r.rule_key='lead_missing_next_action' and r.is_enabled
    where l.deleted_at is null and l.pipeline_stage not in ('finalizat','pierdut')
      and (p_agency_id is null or l.agency_id=p_agency_id)
      and l.next_action_at is null
      and l.pipeline_stage_changed_at <= p_now
        - make_interval(mins=>greatest(1,coalesce((r.config->>'grace_minutes')::integer,60)))
  )
  insert into public.automation_events(agency_id,trigger_key,entity_type,entity_id,dedup_key,payload,occurred_at)
  select agency_id,'lead.missing_next_action','lead',id::text,
    'lead.missing_next_action:'||id::text||':'||extract(epoch from pipeline_stage_changed_at)::bigint,
    jsonb_build_object('lead',to_jsonb(candidates)),p_now
  from candidates on conflict(agency_id,dedup_key) do nothing;
  get diagnostics n=row_count; created_count:=created_count+n;

  return jsonb_build_object('created',created_count,'swept_at',p_now);
end
$$;

create or replace function public.crm_claim_automation_jobs(
  p_limit integer default 20,
  p_agency_id uuid default null
)
returns table(
  id uuid,agency_id uuid,rule_id uuid,event_id uuid,rule_key text,trigger_key text,
  attempts integer,max_attempts integer,retry_delay_minutes integer,payload jsonb
)
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  return query
  with due as (
    select j.id
    from public.automation_jobs j join public.automation_rules r on r.id=j.rule_id
    where r.is_enabled and (p_agency_id is null or j.agency_id=p_agency_id) and (
      (j.status in ('pending','retry') and j.run_after<=now())
      or (j.status='processing' and j.locked_at<now()-interval '15 minutes')
    )
    order by j.run_after,j.created_at
    for update of j skip locked limit greatest(1,least(coalesce(p_limit,20),100))
  ), claimed as (
    update public.automation_jobs j
    set status='processing',attempts=j.attempts+1,locked_at=now(),updated_at=now()
    from due where j.id=due.id returning j.*
  )
  select c.id,c.agency_id,c.rule_id,c.event_id,r.rule_key,r.trigger_key,
    c.attempts,c.max_attempts,r.retry_delay_minutes,c.payload
  from claimed c join public.automation_rules r on r.id=c.rule_id;
end
$$;

create or replace function public.crm_finish_automation_job(
  p_job_id uuid,
  p_success boolean,
  p_result jsonb default '{}'::jsonb,
  p_error text default null,
  p_duration_ms integer default null
)
returns text
language plpgsql
security definer
set search_path=public,pg_temp
as $$
declare job public.automation_jobs%rowtype; rule public.automation_rules%rowtype; next_status text;
begin
  select * into job from public.automation_jobs where id=p_job_id for update;
  if not found then raise exception 'automation_job_not_found'; end if;
  select * into rule from public.automation_rules where id=job.rule_id;

  if not rule.is_enabled then
    next_status:='cancelled';
  elsif p_success then
    next_status:='completed';
  elsif job.attempts>=job.max_attempts then
    next_status:='failed';
  else
    next_status:='retry';
  end if;

  update public.automation_jobs set
    status=next_status,
    completed_at=case when next_status in ('completed','failed','cancelled') then now() else null end,
    run_after=case when next_status='retry'
      then now()+make_interval(mins=>greatest(1,rule.retry_delay_minutes)*greatest(1,job.attempts))
      else run_after end,
    locked_at=null,
    last_error=case when p_success then null else left(coalesce(p_error,'Eroare necunoscută'),1000) end,
    result=coalesce(p_result,'{}'::jsonb),
    updated_at=now()
  where id=job.id;

  insert into public.automation_run_logs(
    agency_id,job_id,rule_id,event_id,attempt,status,input,output,error_message,duration_ms
  ) values (
    job.agency_id,job.id,job.rule_id,job.event_id,job.attempts,next_status,
    job.payload,coalesce(p_result,'{}'::jsonb),
    case when p_success then null else left(coalesce(p_error,'Eroare necunoscută'),1000) end,
    p_duration_ms
  ) on conflict(job_id,attempt) do update set
    status=excluded.status,output=excluded.output,error_message=excluded.error_message,
    duration_ms=excluded.duration_ms,created_at=now();

  update public.automation_rules set last_run_at=now(),updated_at=now() where id=job.rule_id;
  update public.automation_events e set
    status=case
      when exists(select 1 from public.automation_jobs x where x.event_id=e.id and x.status='failed') then 'failed'
      when not exists(select 1 from public.automation_jobs x where x.event_id=e.id and x.status in ('pending','retry','processing'))
        then 'completed'
      else e.status end,
    updated_at=now()
  where e.id=job.event_id;
  return next_status;
end
$$;

create or replace function public.crm_retry_automation_job(p_agency_id uuid,p_job_id uuid)
returns boolean
language plpgsql
security definer
set search_path=public,pg_temp
as $$
begin
  update public.automation_jobs set status='pending',attempts=0,run_after=now(),
    completed_at=null,locked_at=null,last_error=null,updated_at=now()
  where id=p_job_id and agency_id=p_agency_id and status in ('failed','cancelled');
  return found;
end
$$;

alter table public.automation_rules enable row level security;
alter table public.automation_events enable row level security;
alter table public.automation_jobs enable row level security;
alter table public.automation_run_logs enable row level security;

revoke all on public.automation_rules,public.automation_events,public.automation_jobs,
  public.automation_run_logs from public,anon,authenticated;
grant select on public.automation_rules,public.automation_events,public.automation_jobs,
  public.automation_run_logs to authenticated,service_role;
grant all on public.automation_rules,public.automation_events,public.automation_jobs,
  public.automation_run_logs to service_role;

drop policy if exists crm_automation_rules_read on public.automation_rules;
create policy crm_automation_rules_read on public.automation_rules for select to authenticated using(
  agency_id=public.current_crm_agency_id() and public.crm_has_permission('settings','view')
);
drop policy if exists crm_automation_events_read on public.automation_events;
create policy crm_automation_events_read on public.automation_events for select to authenticated using(
  agency_id=public.current_crm_agency_id() and public.crm_has_permission('settings','view')
);
drop policy if exists crm_automation_jobs_read on public.automation_jobs;
create policy crm_automation_jobs_read on public.automation_jobs for select to authenticated using(
  agency_id=public.current_crm_agency_id() and public.crm_has_permission('settings','view')
);
drop policy if exists crm_automation_logs_read on public.automation_run_logs;
create policy crm_automation_logs_read on public.automation_run_logs for select to authenticated using(
  agency_id=public.current_crm_agency_id() and public.crm_has_permission('settings','view')
);

revoke all on function public.crm_seed_automation_rules(uuid) from public,anon,authenticated;
revoke all on function public.crm_seed_new_agency_automations() from public,anon,authenticated;
revoke all on function public.crm_dispatch_automation_event() from public,anon,authenticated;
revoke all on function public.crm_enqueue_automation_event(uuid,text,text,text,text,jsonb,timestamptz)
  from public,anon,authenticated;
revoke all on function public.crm_capture_automation_event() from public,anon,authenticated;
revoke all on function public.crm_sweep_due_automations(timestamptz,uuid) from public,anon,authenticated;
revoke all on function public.crm_claim_automation_jobs(integer,uuid) from public,anon,authenticated;
revoke all on function public.crm_finish_automation_job(uuid,boolean,jsonb,text,integer)
  from public,anon,authenticated;
revoke all on function public.crm_retry_automation_job(uuid,uuid) from public,anon,authenticated;

grant execute on function public.crm_seed_automation_rules(uuid) to service_role;
grant execute on function public.crm_enqueue_automation_event(uuid,text,text,text,text,jsonb,timestamptz)
  to service_role;
grant execute on function public.crm_sweep_due_automations(timestamptz,uuid) to service_role;
grant execute on function public.crm_claim_automation_jobs(integer,uuid) to service_role;
grant execute on function public.crm_finish_automation_job(uuid,boolean,jsonb,text,integer)
  to service_role;
grant execute on function public.crm_retry_automation_job(uuid,uuid) to service_role;

comment on table public.automation_rules is
  'Configurable agency automation registry. Disabling a rule prevents new claims without deleting history.';
comment on table public.automation_events is
  'Immutable domain-event inbox with agency-scoped duplicate prevention.';
comment on table public.automation_jobs is
  'Durable automation outbox with leases, retries and one job per rule/event.';
comment on table public.automation_run_logs is
  'Append-only attempt audit for automation diagnostics.';
comment on column public.tasks.automation_job_id is
  'Idempotency evidence for tasks created by the automation engine.';

commit;
