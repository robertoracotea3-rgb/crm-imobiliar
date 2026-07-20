create schema if not exists auth;
create table if not exists auth.users (
  id uuid primary key
);

create table if not exists public.agencies (
  id uuid primary key
);

create table if not exists public.portals (
  id text primary key,
  name text not null,
  integration_type text not null,
  is_active boolean not null default true
);

create table if not exists public.properties (
  id uuid primary key,
  agency_id uuid not null references public.agencies(id),
  agent_id uuid,
  title text,
  city text,
  county text,
  category text,
  deleted_at timestamptz
);

create table if not exists public.portal_listings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  property_id uuid not null references public.properties(id),
  portal text not null default 'storia',
  external_id text,
  status text default 'pending',
  advert_url text,
  last_sync_at timestamptz,
  error_message text,
  raw_response jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(property_id, portal)
);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  property_id uuid references public.properties(id),
  portal_id text references public.portals(id),
  source text,
  deleted_at timestamptz,
  received_at timestamptz not null default now()
);

insert into public.agencies(id)
values ('10000000-0000-4000-8000-000000000001')
on conflict do nothing;

insert into public.properties(id, agency_id, agent_id, title, city, county, category)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'Apartament test',
  'Făgăraș',
  'Brașov',
  'apartament'
)
on conflict do nothing;

insert into public.portal_listings(
  id, agency_id, property_id, portal, external_id, raw_response
)
values (
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'storia',
  '50000000-0000-4000-8000-000000000001',
  '{"data":{"id":18196158,"uuid":"50000000-0000-4000-8000-000000000001"}}'::jsonb
)
on conflict do nothing;
