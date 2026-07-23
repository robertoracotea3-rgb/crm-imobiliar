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
  agency_id uuid not null references public.agencies(id),
  role text,
  status text default 'active'
);
create table public.contacts(
  id uuid primary key,
  agency_id uuid not null references public.agencies(id),
  deleted_at timestamptz,
  merge_status text default 'active'
);
create table public.properties(
  id uuid primary key,
  agency_id uuid not null references public.agencies(id),
  title text,
  internal_code text,
  category text,
  city text,
  attributes jsonb default '{}'::jsonb,
  deleted_at timestamptz
);
create table public.leads(
  id uuid primary key,
  agency_id uuid not null references public.agencies(id),
  contact_name text,
  contact_phone text,
  source text,
  status text default 'new',
  legacy_status text,
  received_at timestamptz default now(),
  first_response_at timestamptz,
  last_contacted_at timestamptz,
  agent_id uuid references auth.users(id),
  contact_id uuid references public.contacts(id),
  property_id uuid references public.properties(id),
  category text,
  transaction text,
  city text,
  county text,
  budget_min numeric,
  budget_max numeric,
  criteria jsonb default '{}'::jsonb,
  next_action_at timestamptz,
  next_action_type text,
  status_reason text,
  status_note text,
  deleted_at timestamptz
);
create table public.demands(
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  contact_id uuid references public.contacts(id),
  status text default 'activa',
  deleted_at timestamptz
);
create table public.calendar_events(
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  lead_id uuid references public.leads(id),
  type text,
  status text,
  start_at timestamptz,
  completed_at timestamptz,
  outcome text,
  deleted_at timestamptz
);
create table public.transactions(
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  lead_id uuid references public.leads(id),
  contact_id uuid references public.contacts(id),
  property_id uuid references public.properties(id),
  status text,
  sale_price numeric,
  deleted_at timestamptz
);
create table public.activities(
  id uuid primary key default gen_random_uuid(),
  agency_id uuid,
  user_id uuid,
  agent_id uuid,
  lead_id uuid,
  contact_id uuid,
  property_id uuid,
  type text,
  title text,
  description text,
  created_at timestamptz default now()
);

create or replace function public.current_crm_agency_id()
returns uuid language sql stable as $$ select null::uuid $$;
create or replace function public.crm_has_permission(text,text)
returns boolean language sql stable as $$ select true $$;

insert into public.agencies values
  ('aaaaaaaa-0000-0000-0000-000000000001','Agenția A'),
  ('bbbbbbbb-0000-0000-0000-000000000001','Agenția B');
insert into auth.users values
  ('aaaaaaaa-1000-0000-0000-000000000001'),
  ('bbbbbbbb-1000-0000-0000-000000000001');
insert into public.profiles values
  ('aaaaaaaa-1000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','owner','active'),
  ('bbbbbbbb-1000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','owner','active');
insert into public.contacts values
  ('aaaaaaaa-2000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',null,'active'),
  ('bbbbbbbb-2000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001',null,'active');
insert into public.properties values
  ('aaaaaaaa-3000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','Apartament A','A-1','apartament','Făgăraș','{}',null),
  ('bbbbbbbb-3000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','Apartament B','B-1','apartament','Brașov','{}',null);
insert into public.leads(
  id,agency_id,contact_name,contact_phone,source,status,received_at,agent_id,
  contact_id,property_id,category,transaction,city,budget_max,criteria,
  next_action_at,next_action_type
) values
  ('aaaaaaaa-4000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
   'Client A','40700000001','storia','new',now()-interval '1 day',
   'aaaaaaaa-1000-0000-0000-000000000001','aaaaaaaa-2000-0000-0000-000000000001',
   'aaaaaaaa-3000-0000-0000-000000000001','apartament','vanzare','Făgăraș',90000,'{}',
   now()+interval '1 day','first_contact'),
  ('bbbbbbbb-4000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001',
   'Client B','40700000002','manual','lost',now()-interval '2 days',
   'bbbbbbbb-1000-0000-0000-000000000001','bbbbbbbb-2000-0000-0000-000000000001',
   'bbbbbbbb-3000-0000-0000-000000000001','apartament','vanzare','Brașov',120000,'{}',
   now()+interval '1 day','follow_up');

grant all on all tables in schema public to service_role;
grant usage on schema public to authenticated;
