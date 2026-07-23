do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
grant usage on schema public,auth to anon,authenticated,service_role;

create table auth.users(id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;
create table public.agencies(id uuid primary key,name text);
create table public.profiles(
  user_id uuid primary key references auth.users(id),
  agency_id uuid not null references public.agencies(id),
  role text,status text default 'active'
);
create table public.properties(
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id),
  title text,status text default 'activa',deleted_at timestamptz,updated_at timestamptz default now()
);
create table public.leads(
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id),
  assigned_to uuid references auth.users(id),
  contact_name text,status text default 'new',
  pipeline_stage text default 'lead_nou',
  pipeline_stage_changed_at timestamptz default now(),
  received_at timestamptz default now(),created_at timestamptz default now(),
  first_response_at timestamptz,last_contacted_at timestamptz,
  next_action_at timestamptz,deleted_at timestamptz
);
create table public.calendar_events(
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id),
  lead_id uuid references public.leads(id),
  property_id uuid references public.properties(id),
  title text,type text,status text,start_at timestamptz,
  completed_at timestamptz,updated_at timestamptz default now(),
  next_action_at timestamptz,outcome text,deleted_at timestamptz
);
create table public.demands(
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id),
  status text default 'activa',deleted_at timestamptz
);
create table public.portal_listings(
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  property_id uuid references public.properties(id),
  portal text default 'storia',external_id text,status text,
  error_message text,updated_at timestamptz default now()
);
create table public.tasks(
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  assigned_to uuid references auth.users(id),
  title text,status text default 'open',due_at timestamptz,
  lead_id uuid references public.leads(id),property_id uuid references public.properties(id),
  deleted_at timestamptz
);
create table public.notifications(
  id uuid primary key default gen_random_uuid(),
  agency_id uuid,user_id uuid,type text,title text,message text,entity_type text,entity_id text,
  priority text,action_url text,dedup_key text,metadata jsonb,created_at timestamptz default now()
);

create function public.current_crm_agency_id() returns uuid language sql stable as $$ select null::uuid $$;
create function public.crm_has_permission(text,text) returns boolean language sql stable as $$ select true $$;

insert into public.agencies values
  ('10000000-0000-0000-0000-000000000001','Agenția A'),
  ('20000000-0000-0000-0000-000000000001','Agenția B');
insert into auth.users values
  ('11000000-0000-0000-0000-000000000001'),
  ('22000000-0000-0000-0000-000000000001');
insert into public.profiles values
  ('11000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','owner','active'),
  ('22000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','owner','active');

grant all on all tables in schema public to service_role;
grant usage on schema public to authenticated;
