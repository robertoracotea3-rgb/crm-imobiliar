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
create table public.prospects (
  id uuid default gen_random_uuid() primary key,
  agency_id uuid references public.agencies(id) on delete cascade not null,
  source text not null, external_id text not null, url text not null, title text, price numeric,
  currency text default 'EUR', category text, transaction text, city text, zone text, phone text,
  seller_name text, alt_sources text[], posted_at timestamptz, status text default 'nou',
  assigned_to uuid references auth.users(id), notes text, first_seen_at timestamptz default now(),
  last_seen_at timestamptz default now(), unique(agency_id, source, external_id)
);

create or replace function public.current_crm_agency_id() returns uuid language sql stable security definer set search_path = public, auth as $$
  select agency_id from public.profiles where user_id = auth.uid() limit 1
$$;
create or replace function public.crm_has_permission(p_module text, p_action text) returns boolean language sql stable as $$ select true $$;
create or replace function public.crm_can_access_row(p_module text, p_owner_ids uuid[]) returns boolean language sql stable security definer set search_path = public, auth as $$
  select auth.uid() = any(coalesce(p_owner_ids, '{}'::uuid[]))
$$;

insert into public.agencies(id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Agency A'),
  ('20000000-0000-0000-0000-000000000002', 'Agency B');
insert into auth.users(id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.profiles(user_id, agency_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'agent'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'agent');

insert into public.prospects(id,agency_id,source,external_id,url,title,price,city,status,first_seen_at,last_seen_at) values
  ('31000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','olx','one','https://olx.ro/ad/one','Casă Făgăraș',100000,'Făgăraș','nou',now()-interval '10 days',now()),
  ('31000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','publi24','two','https://olx.ro/ad/one','Casă Făgăraș',100000,'Făgăraș','nou',now()-interval '10 days',now()),
  ('31000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001','olx','old','https://olx.ro/ad/old','Teren Bran',50000,'Bran','nou',now()-interval '30 days',now()-interval '20 days'),
  ('32000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000002','olx','other','https://olx.ro/ad/other','Apartament Sibiu',70000,'Sibiu','nou',now(),now());
