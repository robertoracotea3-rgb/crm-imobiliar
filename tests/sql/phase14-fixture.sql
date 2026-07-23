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
create table public.agencies(id uuid primary key,name text);
create table public.profiles(
  user_id uuid primary key references auth.users(id),
  agency_id uuid references public.agencies(id),
  role text,
  status text default 'active'
);

insert into public.agencies values
 ('aaaaaaaa-0000-0000-0000-000000000001','Agenția A'),
 ('bbbbbbbb-0000-0000-0000-000000000001','Agenția B');
insert into auth.users values
 ('aaaaaaaa-1000-0000-0000-000000000001'),
 ('bbbbbbbb-1000-0000-0000-000000000001');
insert into public.profiles values
 ('aaaaaaaa-1000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','owner','active'),
 ('bbbbbbbb-1000-0000-0000-000000000001','bbbbbbbb-0000-0000-0000-000000000001','owner','active');

create table public.portal_tokens(
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  portal text not null default 'storia',
  access_token text,
  refresh_token text,
  token_type text default 'Bearer',
  expires_at timestamptz,
  scope text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(agency_id,portal)
);
grant all on public.portal_tokens to anon,authenticated,service_role;
