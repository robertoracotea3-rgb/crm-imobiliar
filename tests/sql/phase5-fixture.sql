create extension if not exists pgcrypto;
create schema if not exists auth;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;

create table if not exists auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}'::jsonb);
alter table auth.users add column if not exists raw_user_meta_data jsonb default '{}'::jsonb;
create or replace function auth.uid()
returns uuid
language sql
stable
as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to authenticated, service_role;
grant execute on function auth.uid() to authenticated, service_role;

drop table if exists public.security_events cascade;
drop table if exists public.crm_role_permissions cascade;
drop table if exists public.property_documents cascade;
drop table if exists public.portal_listings cascade;
drop table if exists public.portal_tokens cascade;
drop table if exists public.message_templates cascade;
drop table if exists public.activity_logs cascade;
drop table if exists public.activities cascade;
drop table if exists public.transactions cascade;
drop table if exists public.prospects cascade;
drop table if exists public.tasks cascade;
drop table if exists public.calendar_events cascade;
drop table if exists public.leads cascade;
drop table if exists public.demands cascade;
drop table if exists public.contacts cascade;
drop table if exists public.properties cascade;
drop table if exists public.profiles cascade;
drop table if exists public.agencies cascade;
delete from auth.users;

create table public.agencies (id uuid primary key, name text not null);
create table public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  agency_id uuid not null references public.agencies(id),
  role text not null,
  status text not null default 'active',
  unique(user_id)
);
create table public.properties (
  id uuid primary key, agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id), title text
);
create table public.contacts (
  id uuid primary key, agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id), created_by uuid references auth.users(id)
);
create table public.demands (
  id uuid primary key, agency_id uuid not null references public.agencies(id), agent_id uuid references auth.users(id)
);
create table public.leads (
  id uuid primary key, agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id), assigned_to uuid references auth.users(id)
);
create table public.calendar_events (
  id uuid primary key, agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id), created_by uuid references auth.users(id)
);
create table public.tasks (
  id uuid primary key, agency_id uuid not null references public.agencies(id),
  assigned_to uuid references auth.users(id), created_by uuid references auth.users(id)
);
create table public.prospects (
  id uuid primary key, agency_id uuid not null references public.agencies(id), assigned_to uuid references auth.users(id)
);
create table public.transactions (
  id uuid primary key, agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id), created_by uuid references auth.users(id), sale_price numeric
);
create table public.activities (
  id uuid primary key, agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id), user_id uuid references auth.users(id)
);
create table public.activity_logs (
  id uuid primary key, agency_id uuid not null references public.agencies(id), user_id uuid references auth.users(id)
);
create table public.property_documents (
  id uuid primary key, agency_id uuid not null references public.agencies(id), property_id uuid references public.properties(id)
);
create table public.portal_listings (
  id uuid primary key, agency_id uuid not null references public.agencies(id), property_id uuid references public.properties(id)
);
create table public.portal_tokens (
  id uuid primary key, agency_id uuid not null references public.agencies(id)
);
create table public.message_templates (
  id uuid primary key, agency_id uuid not null references public.agencies(id)
);

insert into public.agencies(id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Agency A'),
  ('20000000-0000-0000-0000-000000000002', 'Agency B');

insert into auth.users(id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002'),
  ('cccccccc-0000-0000-0000-000000000003'),
  ('dddddddd-0000-0000-0000-000000000004'),
  ('eeeeeeee-0000-0000-0000-000000000005'),
  ('ffffffff-0000-0000-0000-000000000006');

insert into public.profiles(user_id, agency_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'agent'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'agent'),
  ('cccccccc-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'manager'),
  ('dddddddd-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000001', 'viewer'),
  ('eeeeeeee-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000001', 'accountant'),
  ('ffffffff-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000002', 'owner');

insert into public.properties(id, agency_id, agent_id, title) values
  ('31000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Agent A property'),
  ('31000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'Agent B property'),
  ('32000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000006', 'Other agency property');

insert into public.transactions(id, agency_id, agent_id, created_by, sale_price) values
  ('41000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 100000),
  ('41000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 200000),
  ('42000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000002', 'ffffffff-0000-0000-0000-000000000006', 'ffffffff-0000-0000-0000-000000000006', 300000);
