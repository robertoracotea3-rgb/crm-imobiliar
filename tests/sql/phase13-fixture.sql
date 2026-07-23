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
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table public.agencies(id uuid primary key,name text);
create table public.profiles(
  user_id uuid primary key references auth.users(id),
  agency_id uuid references public.agencies(id),
  role text,status text default 'active'
);
create or replace function public.current_crm_agency_id() returns uuid language sql stable security definer
set search_path=public,auth as $$
  select agency_id from public.profiles where user_id=auth.uid() limit 1
$$;
create or replace function public.crm_has_permission(p_module text,p_action text)
returns boolean language sql stable as $$ select true $$;

create table public.properties(
  id uuid primary key,
  agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id),
  title text,
  attributes jsonb not null default '{}'::jsonb,
  deleted_at timestamptz,
  updated_at timestamptz not null default now()
);
create table public.property_photos(
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id),
  storage_path text not null,
  sort_order integer not null default 0,
  is_cover boolean not null default false,
  is_private boolean not null default false,
  is_floorplan boolean not null default false,
  is_360 boolean not null default false,
  width integer,
  height integer,
  created_at timestamptz not null default now()
);
create or replace function public.crm_can_access_property(p_property_id uuid,p_action text)
returns boolean language sql stable as $$
  select exists(
    select 1 from public.properties
    where id=p_property_id and agency_id=public.current_crm_agency_id() and deleted_at is null
  )
$$;

insert into public.agencies values
 ('aaaaaaaa-0000-0000-0000-000000000001','Agenția A'),
 ('bbbbbbbb-0000-0000-0000-000000000001','Agenția B');
insert into auth.users values
 ('aaaaaaaa-1000-0000-0000-000000000001'),
 ('bbbbbbbb-1000-0000-0000-000000000001');
insert into public.profiles values
 ('aaaaaaaa-1000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','owner','active'),
 ('bbbbbbbb-1000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','owner','active');

insert into public.properties(id,agency_id,agent_id,title,attributes) values
(
 'aaaaaaaa-2000-0000-0000-000000000001',
 'aaaaaaaa-0000-0000-0000-000000000001',
 'aaaaaaaa-1000-0000-0000-000000000001',
 'Apartament A',
 jsonb_build_object('photos',jsonb_build_array(
  'https://test.supabase.co/storage/v1/object/public/property-photos/aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-2000-0000-0000-000000000001/hash-1/medium.webp',
  'https://test.supabase.co/storage/v1/object/public/property-photos/aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-2000-0000-0000-000000000001/hash-2/medium.webp',
  'https://test.supabase.co/storage/v1/object/public/property-photos/aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-2000-0000-0000-000000000001/hash-3/medium.webp'
 ))
),(
 'bbbbbbbb-2000-0000-0000-000000000001',
 'bbbbbbbb-0000-0000-0000-000000000001',
 'bbbbbbbb-1000-0000-0000-000000000001',
 'Apartament B',
 jsonb_build_object('photos',jsonb_build_array(
  'https://test.supabase.co/storage/v1/object/public/property-photos/bbbbbbbb-0000-0000-0000-000000000001/bbbbbbbb-2000-0000-0000-000000000001/hash-b/medium.webp'
 ))
);
insert into public.property_photos(property_id,storage_path,sort_order,is_cover) values
 ('aaaaaaaa-2000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-2000-0000-0000-000000000001/hash-1/medium.webp',0,true),
 ('bbbbbbbb-2000-0000-0000-000000000001',
  'bbbbbbbb-0000-0000-0000-000000000001/bbbbbbbb-2000-0000-0000-000000000001/hash-b/medium.webp',0,true);

grant select on public.properties,public.profiles to authenticated;
grant select on public.profiles to service_role;
