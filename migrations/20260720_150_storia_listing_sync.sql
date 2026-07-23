-- Phase 16: durable Storia listing verification, history and scheduled sync health.
-- Webhooks remain primary; metadata reconciliation is a bounded safety mechanism.

begin;

alter table public.portal_listings add column if not exists portal_ad_id text;
alter table public.portal_listings add column if not exists agent_id uuid references auth.users(id);
alter table public.portal_listings add column if not exists remote_status text;
alter table public.portal_listings add column if not exists remote_exists boolean;
alter table public.portal_listings add column if not exists last_checked_at timestamptz;
alter table public.portal_listings add column if not exists last_check_result text not null default 'never';
alter table public.portal_listings add column if not exists last_error_at timestamptz;
alter table public.portal_listings add column if not exists last_error_code text;
alter table public.portal_listings add column if not exists last_check_payload jsonb not null default '{}'::jsonb;
alter table public.portal_listings add column if not exists consecutive_check_failures integer not null default 0;
alter table public.portal_listings add column if not exists verified_active_at timestamptz;
alter table public.portal_listings add column if not exists next_check_at timestamptz;
alter table public.portal_listings add column if not exists stale_alerted_at timestamptz;

update public.portal_listings listing
set agent_id=property.agent_id
from public.properties property
where property.id=listing.property_id
  and property.agency_id=listing.agency_id
  and listing.agent_id is distinct from property.agent_id;
update public.portal_listings
set remote_status=status
where remote_status is null;

alter table public.portal_listings drop constraint if exists portal_listings_check_result_check;
alter table public.portal_listings add constraint portal_listings_check_result_check
  check(last_check_result in ('never','verified','not_found','error')) not valid;
alter table public.portal_listings validate constraint portal_listings_check_result_check;
alter table public.portal_listings drop constraint if exists portal_listings_check_failures_check;
alter table public.portal_listings add constraint portal_listings_check_failures_check
  check(consecutive_check_failures>=0) not valid;
alter table public.portal_listings validate constraint portal_listings_check_failures_check;
create index if not exists portal_listings_due_check_idx
  on public.portal_listings(agency_id,portal,next_check_at,last_checked_at)
  where status<>'deleted' and external_id is not null;
create index if not exists portal_listings_agent_idx
  on public.portal_listings(agency_id,agent_id,status);

create table if not exists public.portal_sync_runs(
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete restrict,
  portal text not null,
  trigger_type text not null check(trigger_type in ('cron','manual','on_demand')),
  job_key text,
  status text not null default 'running'
    check(status in ('running','completed','partial','failed','abandoned')),
  checked_count integer not null default 0,
  active_count integer not null default 0,
  changed_count integer not null default 0,
  missing_count integer not null default 0,
  error_count integer not null default 0,
  stale_count integer not null default 0,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  created_at timestamptz not null default now()
);
create unique index if not exists portal_sync_runs_running_uidx
  on public.portal_sync_runs(agency_id,portal) where status='running';
create unique index if not exists portal_sync_runs_job_key_uidx
  on public.portal_sync_runs(agency_id,portal,job_key) where job_key is not null;
create index if not exists portal_sync_runs_history_idx
  on public.portal_sync_runs(agency_id,portal,started_at desc);

create table if not exists public.portal_listing_checks(
  id bigint generated always as identity primary key,
  agency_id uuid not null references public.agencies(id) on delete restrict,
  portal text not null,
  portal_listing_id uuid not null references public.portal_listings(id) on delete restrict,
  sync_run_id uuid references public.portal_sync_runs(id) on delete set null,
  property_id uuid not null references public.properties(id) on delete restrict,
  agent_id uuid references auth.users(id) on delete set null,
  result text not null check(result in ('verified','not_found','error')),
  remote_status text,
  remote_exists boolean,
  external_id text,
  portal_ad_id text,
  advert_url text,
  error_code text,
  error_message text,
  payload jsonb not null default '{}'::jsonb,
  duration_ms integer,
  checked_at timestamptz not null default now()
);
create index if not exists portal_listing_checks_listing_idx
  on public.portal_listing_checks(portal_listing_id,checked_at desc);
create index if not exists portal_listing_checks_run_idx
  on public.portal_listing_checks(sync_run_id,checked_at);
create index if not exists portal_listing_checks_errors_idx
  on public.portal_listing_checks(agency_id,checked_at desc)
  where result='error';

create table if not exists public.portal_sync_health(
  agency_id uuid not null references public.agencies(id) on delete restrict,
  portal text not null,
  status text not null default 'never'
    check(status in ('never','running','healthy','degraded','failed','stale')),
  last_run_id uuid references public.portal_sync_runs(id) on delete set null,
  last_started_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error_code text,
  last_error_message text,
  last_duration_ms integer,
  last_checked_count integer not null default 0,
  consecutive_failures integer not null default 0,
  stale_listing_count integer not null default 0,
  next_run_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key(agency_id,portal)
);

create or replace function public.crm_start_portal_sync_run(
  p_agency_id uuid,p_portal text,p_trigger_type text,p_job_key text default null
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare run_id uuid;
begin
  if p_trigger_type not in ('cron','manual','on_demand') then
    raise exception 'portal_sync_trigger_invalid';
  end if;

  update public.portal_sync_runs
  set status='abandoned',finished_at=now(),
      duration_ms=greatest(0,(extract(epoch from(now()-started_at))*1000)::integer),
      error_code='run_timeout',error_message='Rularea anterioară a depășit limita.'
  where agency_id=p_agency_id and portal=p_portal and status='running'
    and started_at<now()-interval '10 minutes';

  begin
    insert into public.portal_sync_runs(agency_id,portal,trigger_type,job_key)
    values(p_agency_id,p_portal,p_trigger_type,nullif(p_job_key,''))
    returning id into run_id;
  exception when unique_violation then
    return null;
  end;

  insert into public.portal_sync_health(
    agency_id,portal,status,last_run_id,last_started_at,next_run_at,updated_at
  ) values(p_agency_id,p_portal,'running',run_id,now(),now()+interval '1 day',now())
  on conflict(agency_id,portal) do update set
    status='running',last_run_id=excluded.last_run_id,last_started_at=excluded.last_started_at,
    next_run_at=excluded.next_run_at,updated_at=now();
  return run_id;
end
$$;

create or replace function public.crm_record_portal_listing_check(
  p_agency_id uuid,p_portal_listing_id uuid,p_sync_run_id uuid,
  p_checked_at timestamptz,p_result text,p_remote_status text,p_remote_exists boolean,
  p_external_id text,p_portal_ad_id text,p_advert_url text,
  p_error_code text,p_error_message text,p_payload jsonb,p_raw_response jsonb,
  p_duration_ms integer,p_agent_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  listing public.portal_listings%rowtype;
  resulting_status text;
  changed boolean:=false;
begin
  if p_result not in ('verified','not_found','error') then
    raise exception 'portal_listing_check_result_invalid';
  end if;
  select * into listing from public.portal_listings
  where id=p_portal_listing_id and agency_id=p_agency_id for update;
  if not found then raise exception 'portal_listing_not_found'; end if;
  if p_sync_run_id is not null and not exists(
    select 1 from public.portal_sync_runs
    where id=p_sync_run_id and agency_id=p_agency_id and portal=listing.portal
  ) then raise exception 'portal_sync_run_not_found'; end if;
  if p_agent_id is not null and not exists(
    select 1 from public.profiles
    where user_id=p_agent_id and agency_id=p_agency_id
  ) then raise exception 'portal_listing_agent_tenant_mismatch'; end if;

  resulting_status:=case
    when p_result='not_found' then 'deleted'
    when p_result='error' then 'error'
    else coalesce(nullif(p_remote_status,''),'pending')
  end;
  changed:=listing.status is distinct from resulting_status
    or (p_external_id is not null and listing.external_id is distinct from p_external_id)
    or (p_portal_ad_id is not null and listing.portal_ad_id is distinct from p_portal_ad_id)
    or (p_advert_url is not null and listing.advert_url is distinct from p_advert_url);

  update public.portal_listings set
    status=resulting_status,
    remote_status=case when p_result='error'
      then coalesce(remote_status,status) else resulting_status end,
    remote_exists=case when p_result='error' then remote_exists else p_remote_exists end,
    external_id=coalesce(nullif(p_external_id,''),external_id),
    portal_ad_id=coalesce(nullif(p_portal_ad_id,''),portal_ad_id),
    advert_url=coalesce(nullif(p_advert_url,''),advert_url),
    agent_id=coalesce(p_agent_id,agent_id),
    last_checked_at=coalesce(p_checked_at,now()),
    last_check_result=p_result,
    last_sync_at=case when p_result in ('verified','not_found')
      then coalesce(p_checked_at,now()) else last_sync_at end,
    last_error_at=case
      when p_result='error' or resulting_status in ('error','rejected')
      then coalesce(p_checked_at,now()) else null end,
    last_error_code=case
      when p_result='error' or resulting_status in ('error','rejected')
      then left(coalesce(nullif(p_error_code,''),'remote_'||resulting_status),80) else null end,
    error_message=case
      when p_result='error' or resulting_status in ('error','rejected')
      then left(coalesce(nullif(p_error_message,''),'Verificarea portalului a eșuat.'),500)
      when p_result='not_found' then 'Anunțul nu mai există pe portal.'
      else null end,
    last_check_payload=coalesce(p_payload,'{}'::jsonb),
    raw_response=case when p_result='verified' and p_raw_response is not null
      then p_raw_response else raw_response end,
    consecutive_check_failures=case when p_result='error'
      then consecutive_check_failures+1 else 0 end,
    verified_active_at=case when p_result='verified' and resulting_status='active'
      then coalesce(p_checked_at,now()) else null end,
    next_check_at=coalesce(p_checked_at,now())+interval '1 day',
    stale_alerted_at=case when p_result in ('verified','not_found') then null else stale_alerted_at end,
    updated_at=now()
  where id=listing.id;

  insert into public.portal_listing_checks(
    agency_id,portal,portal_listing_id,sync_run_id,property_id,agent_id,result,
    remote_status,remote_exists,external_id,portal_ad_id,advert_url,error_code,
    error_message,payload,duration_ms,checked_at
  ) values(
    p_agency_id,listing.portal,listing.id,p_sync_run_id,listing.property_id,
    coalesce(p_agent_id,listing.agent_id),p_result,resulting_status,p_remote_exists,
    coalesce(nullif(p_external_id,''),listing.external_id),
    coalesce(nullif(p_portal_ad_id,''),listing.portal_ad_id),
    coalesce(nullif(p_advert_url,''),listing.advert_url),
    left(nullif(p_error_code,''),80),left(nullif(p_error_message,''),500),
    coalesce(p_payload,'{}'::jsonb),greatest(0,coalesce(p_duration_ms,0)),
    coalesce(p_checked_at,now())
  );

  if p_result='error' or resulting_status in ('error','rejected') then
    perform public.crm_enqueue_notification(
      p_agency_id,null,'portal_listing_error','Eroare listare Storia',
      left(coalesce(nullif(p_error_message,''),'Listarea nu a putut fi verificată.'),500),
      'portal_listing',listing.id::text,'high','/portals',
      'portal_listing_error:'||listing.id::text||':'||
        coalesce(nullif(p_error_code,''),resulting_status),
      jsonb_build_object('property_id',listing.property_id,'portal',listing.portal)
    );
  end if;

  return jsonb_build_object(
    'listing_id',listing.id,'status',resulting_status,'changed',changed,
    'result',p_result,'property_id',listing.property_id
  );
end
$$;

create or replace function public.crm_mark_stale_portal_listings(
  p_agency_id uuid,p_portal text,p_threshold interval default interval '36 hours'
) returns integer language plpgsql security definer set search_path=public,pg_temp as $$
declare listing record; stale_count integer:=0;
begin
  for listing in
    select id,property_id,last_checked_at,created_at
    from public.portal_listings
    where agency_id=p_agency_id and portal=p_portal and status<>'deleted'
      and (last_checked_at is null or last_checked_at<now()-p_threshold)
      and stale_alerted_at is null
  loop
    perform public.crm_enqueue_notification(
      p_agency_id,null,'portal_listing_stale','Listare Storia neverificată',
      'Listarea nu a fost confirmată pe portal în intervalul stabilit.',
      'portal_listing',listing.id::text,'high','/portals',
      'portal_listing_stale:'||listing.id::text||':'||
        extract(epoch from coalesce(listing.last_checked_at,listing.created_at))::bigint::text,
      jsonb_build_object('property_id',listing.property_id,'portal',p_portal)
    );
    update public.portal_listings set stale_alerted_at=now(),updated_at=now()
    where id=listing.id and agency_id=p_agency_id;
  end loop;
  select count(*) into stale_count
  from public.portal_listings
  where agency_id=p_agency_id and portal=p_portal and status<>'deleted'
    and (last_checked_at is null or last_checked_at<now()-p_threshold);
  return stale_count;
end
$$;

create or replace function public.crm_finish_portal_sync_run(
  p_agency_id uuid,p_run_id uuid,p_status text,
  p_checked_count integer,p_active_count integer,p_changed_count integer,
  p_missing_count integer,p_error_count integer,p_stale_count integer,
  p_error_code text default null,p_error_message text default null
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare run public.portal_sync_runs%rowtype; duration integer;
begin
  if p_status not in ('completed','partial','failed') then
    raise exception 'portal_sync_finish_status_invalid';
  end if;
  select * into run from public.portal_sync_runs
  where id=p_run_id and agency_id=p_agency_id and status='running' for update;
  if not found then return false; end if;
  duration:=greatest(0,(extract(epoch from(now()-run.started_at))*1000)::integer);
  update public.portal_sync_runs set
    status=p_status,checked_count=greatest(0,coalesce(p_checked_count,0)),
    active_count=greatest(0,coalesce(p_active_count,0)),
    changed_count=greatest(0,coalesce(p_changed_count,0)),
    missing_count=greatest(0,coalesce(p_missing_count,0)),
    error_count=greatest(0,coalesce(p_error_count,0)),
    stale_count=greatest(0,coalesce(p_stale_count,0)),
    error_code=left(nullif(p_error_code,''),80),
    error_message=left(nullif(p_error_message,''),500),
    finished_at=now(),duration_ms=duration
  where id=run.id;

  insert into public.portal_sync_health(
    agency_id,portal,status,last_run_id,last_started_at,last_success_at,last_error_at,
    last_error_code,last_error_message,last_duration_ms,last_checked_count,
    consecutive_failures,stale_listing_count,next_run_at,updated_at
  ) values(
    p_agency_id,run.portal,
    case when p_status='completed' and coalesce(p_stale_count,0)=0 then 'healthy'
      when p_status='failed' then 'failed' else 'degraded' end,
    run.id,run.started_at,
    case when p_status in ('completed','partial') then now() else null end,
    case when p_status='failed' or coalesce(p_error_count,0)>0 then now() else null end,
    left(nullif(p_error_code,''),80),left(nullif(p_error_message,''),500),duration,
    greatest(0,coalesce(p_checked_count,0)),
    case when p_status='failed' then 1 else 0 end,
    greatest(0,coalesce(p_stale_count,0)),now()+interval '1 day',now()
  )
  on conflict(agency_id,portal) do update set
    status=excluded.status,last_run_id=excluded.last_run_id,
    last_started_at=excluded.last_started_at,
    last_success_at=coalesce(excluded.last_success_at,public.portal_sync_health.last_success_at),
    last_error_at=coalesce(excluded.last_error_at,public.portal_sync_health.last_error_at),
    last_error_code=excluded.last_error_code,last_error_message=excluded.last_error_message,
    last_duration_ms=excluded.last_duration_ms,last_checked_count=excluded.last_checked_count,
    consecutive_failures=case when p_status='failed'
      then public.portal_sync_health.consecutive_failures+1 else 0 end,
    stale_listing_count=excluded.stale_listing_count,next_run_at=excluded.next_run_at,updated_at=now();
  return true;
end
$$;

alter table public.portal_sync_runs enable row level security;
alter table public.portal_listing_checks enable row level security;
alter table public.portal_sync_health enable row level security;
revoke all on public.portal_sync_runs,public.portal_listing_checks,public.portal_sync_health
  from public,anon,authenticated;
grant all on public.portal_sync_runs,public.portal_listing_checks,public.portal_sync_health
  to service_role;

revoke all on function public.crm_start_portal_sync_run(uuid,text,text,text)
  from public,anon,authenticated;
revoke all on function public.crm_record_portal_listing_check(
  uuid,uuid,uuid,timestamptz,text,text,boolean,text,text,text,text,text,jsonb,jsonb,integer,uuid
) from public,anon,authenticated;
revoke all on function public.crm_mark_stale_portal_listings(uuid,text,interval)
  from public,anon,authenticated;
revoke all on function public.crm_finish_portal_sync_run(
  uuid,uuid,text,integer,integer,integer,integer,integer,integer,text,text
) from public,anon,authenticated;
grant execute on function public.crm_start_portal_sync_run(uuid,text,text,text) to service_role;
grant execute on function public.crm_record_portal_listing_check(
  uuid,uuid,uuid,timestamptz,text,text,boolean,text,text,text,text,text,jsonb,jsonb,integer,uuid
) to service_role;
grant execute on function public.crm_mark_stale_portal_listings(uuid,text,interval) to service_role;
grant execute on function public.crm_finish_portal_sync_run(
  uuid,uuid,text,integer,integer,integer,integer,integer,integer,text,text
) to service_role;

commit;
