do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
grant usage on schema public,auth to anon,authenticated,service_role;

create table auth.users(id uuid primary key);
create table public.agencies(id uuid primary key,name text);
create table public.profiles(
  user_id uuid primary key references auth.users(id),
  agency_id uuid references public.agencies(id),
  role text,
  status text default 'active',
  full_name text
);
create table public.properties(
  id uuid primary key,
  agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id),
  title text,
  internal_code text,
  deleted_at timestamptz
);
create table public.portal_listings(
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  property_id uuid not null,
  portal text not null default 'storia',
  external_id text,
  status text default 'pending',
  advert_url text,
  last_sync_at timestamptz,
  error_message text,
  raw_response jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(property_id,portal)
);
create table public.notifications(
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  user_id uuid not null,
  type text,
  title text,
  message text,
  entity_type text,
  entity_id text,
  priority text,
  action_url text,
  dedup_key text,
  metadata jsonb,
  updated_at timestamptz default now(),
  unique(agency_id,user_id,dedup_key)
);

create or replace function public.crm_enqueue_notification(
  p_agency_id uuid,p_user_id uuid,p_type text,p_title text,p_message text,
  p_entity_type text,p_entity_id text,p_priority text,p_action_url text,
  p_dedup_key text,p_metadata jsonb default '{}'::jsonb
) returns integer language plpgsql as $$
declare affected integer;
begin
  insert into public.notifications(
    agency_id,user_id,type,title,message,entity_type,entity_id,priority,
    action_url,dedup_key,metadata
  )
  select p_agency_id,profile.user_id,p_type,p_title,p_message,p_entity_type,
    p_entity_id,p_priority,p_action_url,p_dedup_key,p_metadata
  from public.profiles profile
  where profile.agency_id=p_agency_id and profile.status='active'
    and (p_user_id is null or profile.user_id=p_user_id)
  on conflict(agency_id,user_id,dedup_key) do update set
    message=excluded.message,updated_at=now();
  get diagnostics affected=row_count;
  return affected;
end
$$;

insert into public.agencies values
 ('aaaaaaaa-0000-0000-0000-000000000001','Agenția A'),
 ('bbbbbbbb-0000-0000-0000-000000000001','Agenția B');
insert into auth.users values
 ('aaaaaaaa-1000-0000-0000-000000000001'),
 ('bbbbbbbb-1000-0000-0000-000000000001');
insert into public.profiles values
 ('aaaaaaaa-1000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','owner','active','Agent A'),
 ('bbbbbbbb-1000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','owner','active','Agent B');
insert into public.properties values
 ('aaaaaaaa-2000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-1000-0000-0000-000000000001','Apartament A','A-1',null),
 ('bbbbbbbb-2000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001',
  'bbbbbbbb-1000-0000-0000-000000000001','Apartament B','B-1',null);
insert into public.portal_listings(
  id,agency_id,property_id,portal,external_id,status,last_sync_at
) values
 ('aaaaaaaa-3000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-2000-0000-0000-000000000001','storia',
  'aaaaaaaa-4000-0000-0000-000000000001','active',now()-interval '2 days'),
 ('bbbbbbbb-3000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001',
  'bbbbbbbb-2000-0000-0000-000000000001','storia',
  'bbbbbbbb-4000-0000-0000-000000000001','active',now()-interval '2 days');

grant all on public.portal_listings to authenticated,service_role;
