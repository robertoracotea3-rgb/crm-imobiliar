create extension if not exists pgcrypto;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
grant usage on schema public,auth to anon,authenticated,service_role;

create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.agencies(id uuid primary key, name text not null);
create table public.profiles(
  user_id uuid primary key references auth.users(id),
  agency_id uuid not null references public.agencies(id),
  role text not null,
  status text not null default 'active'
);
create or replace function public.current_crm_agency_id() returns uuid language sql stable security definer
set search_path=public,auth as $$
  select agency_id from public.profiles where user_id=auth.uid() limit 1
$$;
create or replace function public.crm_has_permission(p_module text,p_action text) returns boolean
language sql stable as $$ select true $$;

create table public.leads(
  id uuid primary key, agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id), assigned_to uuid references auth.users(id),
  created_by uuid references auth.users(id), contact_name text, status text default 'new',
  received_at timestamptz default now(), deleted_at timestamptz
);
create table public.tasks(
  id uuid primary key, agency_id uuid not null references public.agencies(id),
  created_by uuid references auth.users(id), assigned_to uuid references auth.users(id),
  title text not null, status text default 'open', due_at timestamptz
);
create table public.calendar_events(
  id uuid primary key, agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id), created_by uuid references auth.users(id),
  title text, type text, status text, start_at timestamptz, deleted_at timestamptz
);
create table public.demands(
  id uuid primary key, agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id)
);
create table public.properties(
  id uuid primary key, agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id), created_by uuid references auth.users(id),
  title text, status text, deleted_at timestamptz
);
create table public.matches(
  id uuid primary key, agency_id uuid not null references public.agencies(id),
  demand_id uuid not null references public.demands(id),
  property_id uuid not null references public.properties(id),
  score numeric default 0, status text default 'noua', created_at timestamptz default now()
);
create table public.portal_listings(
  id uuid primary key, agency_id uuid not null references public.agencies(id),
  property_id uuid not null references public.properties(id),
  status text, error_message text
);
create table public.webhook_events(
  id uuid primary key, agency_id uuid references public.agencies(id),
  processing_status text, security_flag boolean default false
);
create table public.transactions(
  id uuid primary key, agency_id uuid not null references public.agencies(id),
  property_id uuid references public.properties(id), agent_id uuid references auth.users(id),
  created_by uuid references auth.users(id), type text, deleted_at timestamptz,
  created_at timestamptz default now()
);
create table public.property_documents(
  id uuid primary key, agency_id uuid not null references public.agencies(id),
  property_id uuid not null references public.properties(id), file_name text not null
);

insert into public.agencies values
  ('10000000-0000-0000-0000-000000000001','Agency A'),
  ('20000000-0000-0000-0000-000000000002','Agency B');
insert into auth.users values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('aaaaaaaa-0000-0000-0000-000000000099'),
  ('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.profiles(user_id,agency_id,role) values
  ('aaaaaaaa-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','agent'),
  ('aaaaaaaa-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000001','manager'),
  ('bbbbbbbb-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','agent');

insert into public.leads values
  ('11000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',null,null,'Client A','new',now()-interval '2 days',null),
  ('21000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',
   'bbbbbbbb-0000-0000-0000-000000000002',null,null,'Client B','new',now()-interval '2 days',null);
insert into public.tasks values
  ('12000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Sună clientul','open',now()-interval '1 hour'),
  ('22000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002',
   'bbbbbbbb-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','Task B','open',now()-interval '1 hour');
insert into public.calendar_events values
  ('13000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
   'Vizionare test','vizionare','programata',now()+interval '1 day',null);
insert into public.demands values
  ('14000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001');
insert into public.properties values
  ('15000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',null,'Proprietate expirată','expirata',null),
  ('15000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001',null,'Proprietate activă','activa',null);
insert into public.matches values
  ('16000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
   '14000000-0000-0000-0000-000000000001','15000000-0000-0000-0000-000000000002',82,'noua',now());
insert into public.portal_listings values
  ('17000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
   '15000000-0000-0000-0000-000000000002','error','Respins de portal');
insert into public.webhook_events values
  ('18000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','rejected',true);
insert into public.transactions values
  ('19000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
   '15000000-0000-0000-0000-000000000002','aaaaaaaa-0000-0000-0000-000000000001',
   'aaaaaaaa-0000-0000-0000-000000000001','vanzare',null,now());
insert into public.property_documents values
  ('1a000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
   '15000000-0000-0000-0000-000000000002','Contract.pdf');
