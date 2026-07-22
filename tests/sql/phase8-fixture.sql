create extension if not exists pgcrypto;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
create schema if not exists auth;
create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.agencies(id uuid primary key, name text not null);
create table public.profiles(
  user_id uuid primary key references auth.users(id), agency_id uuid not null references public.agencies(id),
  role text not null, status text not null default 'active'
);
create table public.contacts(
  id uuid primary key, agency_id uuid not null references public.agencies(id), full_name text not null,
  deleted_at timestamptz
);
create type public.property_category as enum('apartament','casa_vila','spatiu_comercial','spatiu_industrial','teren','pensiune_hotel','birou','garaj');
create type public.transaction_type as enum('vanzare','inchiriere','regim_hotelier');
create table public.demands(
  id uuid primary key default gen_random_uuid(), agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id), contact_id uuid references public.contacts(id), internal_code text,
  status text default 'activa', category public.property_category, transaction public.transaction_type, source text, budget_min numeric, budget_max numeric,
  currency text default 'EUR', counties text[], cities text[], zones text[], criteria jsonb not null default '{}'::jsonb,
  notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table public.properties(
  id uuid primary key default gen_random_uuid(), agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id), internal_code text, title text, status text, category public.property_category,
  transaction public.transaction_type, county text, city text, zone text, price numeric, currency text default 'EUR',
  attributes jsonb not null default '{}'::jsonb, created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.matches(
  id uuid primary key default gen_random_uuid(), demand_id uuid not null references public.demands(id),
  property_id uuid not null references public.properties(id), score numeric not null, status text not null default 'noua',
  proposed_at timestamptz, sent_at timestamptz, sent_via text, feedback text, created_at timestamptz not null default now()
);

create or replace function public.current_crm_agency_id() returns uuid language sql stable security definer set search_path = public, auth as $$
  select agency_id from public.profiles where user_id = auth.uid() limit 1
$$;
create or replace function public.crm_has_permission(p_module text, p_action text) returns boolean language sql stable as $$ select true $$;
create or replace function public.crm_can_access_row(p_module text, p_owner_ids uuid[]) returns boolean language sql stable security definer set search_path = public, auth as $$
  select auth.uid() = any(coalesce(p_owner_ids, '{}'::uuid[]))
$$;
grant usage on schema auth to authenticated;
grant execute on function auth.uid() to authenticated;
grant select on public.profiles, public.demands, public.properties to authenticated;

insert into public.agencies(id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Agency A'),
  ('20000000-0000-0000-0000-000000000002', 'Agency B');
insert into auth.users(id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.profiles(user_id, agency_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'agent'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'agent');
insert into public.contacts(id, agency_id, full_name) values
  ('31000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'Client A'),
  ('32000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'Client B');
insert into public.demands(id, agency_id, agent_id, contact_id, internal_code, category, transaction, cities, counties, criteria) values
  ('41000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001', 'CE-0001', 'apartament', 'vanzare', array[U&'F\0103g\0103ra\0219'], array[U&'Bra\0219ov'], '{"nr_camere_min": 2, "suprafata_min": 50}'),
  ('42000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', '32000000-0000-0000-0000-000000000002', 'CE-0002', 'apartament', 'vanzare', array['Sibiu'], array['Sibiu'], '{}');
insert into public.properties(id, agency_id, agent_id, internal_code, title, status, category, transaction, county, city, zone, price, attributes) values
  ('51000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'KI-1', U&'Apartament F\0103g\0103ra\0219', 'activa', 'apartament', 'vanzare', U&'Bra\0219ov', U&'F\0103g\0103ra\0219', 'Central', 70000, '{"nr_camere": 3, "sup_utila": 65}'),
  ('52000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'KI-2', 'Apartament Sibiu', 'activa', 'apartament', 'vanzare', 'Sibiu', 'Sibiu', 'Central', 80000, '{"nr_camere": 2, "sup_utila": 55}');
