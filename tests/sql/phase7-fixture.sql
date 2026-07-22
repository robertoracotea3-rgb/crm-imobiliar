create extension if not exists pgcrypto;
create schema if not exists auth;

create table auth.users (id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;

create table public.agencies (id uuid primary key, name text not null);
create table public.profiles (
  id uuid primary key default gen_random_uuid(), user_id uuid not null references auth.users(id),
  agency_id uuid not null references public.agencies(id), role text not null,
  status text not null default 'active', permissions jsonb
);
create table public.lead_sources (code text primary key, label text not null);

create table public.contacts (
  id uuid primary key default gen_random_uuid(), agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id), created_by uuid references auth.users(id),
  full_name text not null, phone text, phone_secondary text, phone2 text, email text,
  cnp text, address text, type text[] default '{}'::text[], notes text, source text,
  gdpr_consent boolean default false, gdpr_consent_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  deleted_at timestamptz, deleted_by uuid references auth.users(id)
);
create table public.properties (
  id uuid primary key default gen_random_uuid(), agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id), owner_contact_id uuid references public.contacts(id),
  internal_code text, title text, city text, category text, status text, attributes jsonb default '{}'::jsonb,
  created_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.demands (
  id uuid primary key default gen_random_uuid(), agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id), contact_id uuid references public.contacts(id),
  internal_code text, source text, source_normalized text, created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table public.leads (
  id uuid primary key default gen_random_uuid(), agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id), assigned_to uuid references auth.users(id),
  contact_name text not null, contact_phone text, contact_email text, message text default '',
  converted_contact_id uuid references public.contacts(id), converted_demand_id uuid references public.demands(id),
  property_id uuid references public.properties(id), portal_id uuid, source text, source_normalized text,
  status text default 'new', next_action_at timestamptz, next_action_type text,
  received_at timestamptz not null default now(), deleted_at timestamptz
);
create table public.activities (
  id uuid primary key default gen_random_uuid(), agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id), user_id uuid references auth.users(id),
  lead_id uuid references public.leads(id), contact_id uuid references public.contacts(id),
  property_id uuid references public.properties(id), type text, title text, description text,
  notes text, created_at timestamptz not null default now()
);
create table public.calendar_events (
  id uuid primary key default gen_random_uuid(), agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id), created_by uuid references auth.users(id),
  lead_id uuid references public.leads(id), contact_id uuid references public.contacts(id),
  property_id uuid references public.properties(id), start_at timestamptz default now(),
  deleted_at timestamptz
);
create table public.transactions (
  id uuid primary key default gen_random_uuid(), agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id), created_by uuid references auth.users(id),
  contact_id uuid references public.contacts(id), created_at timestamptz not null default now(),
  deleted_at timestamptz
);
create table public.activity_logs (
  id uuid primary key default gen_random_uuid(), agency_id uuid references public.agencies(id),
  entity_type text not null, entity_id uuid not null, user_id uuid references auth.users(id),
  action text not null, field text, old_value text, new_value text, created_at timestamptz default now()
);

create or replace function public.current_crm_agency_id() returns uuid language sql stable as $$
  select agency_id from public.profiles where user_id = auth.uid() limit 1
$$;
create or replace function public.crm_has_permission(p_module text, p_action text) returns boolean language sql stable as $$
  select true
$$;
create or replace function public.crm_can_access_row(p_module text, p_owner_ids uuid[]) returns boolean language sql stable as $$
  select true
$$;

insert into public.agencies(id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Agency A'),
  ('20000000-0000-0000-0000-000000000002', 'Agency B');
insert into auth.users(id) values
  ('aaaaaaaa-0000-0000-0000-000000000001'),
  ('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.profiles(user_id, agency_id, role) values
  ('aaaaaaaa-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'manager'),
  ('bbbbbbbb-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'owner');
insert into public.lead_sources(code, label) values ('manual', 'Manual'), ('storia', 'Storia');

insert into public.contacts(id, agency_id, agent_id, created_by, full_name, phone, email) values
  ('31000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Duplicate One', '0722 111 111', 'one@example.ro'),
  ('31000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Duplicate Two', '+40 722 111 111', 'two@example.ro'),
  ('31000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Safe Existing', '0733 222 222', 'safe@example.ro'),
  ('32000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'Other Agency', '0744 333 333', 'other@example.ro');

insert into public.leads(id, agency_id, agent_id, assigned_to, contact_name, contact_phone, contact_email, source, source_normalized, next_action_at, next_action_type) values
  ('41000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Safe Lead', '+40733222222', 'SAFE@example.ro', 'manual', 'manual', now() + interval '1 day', 'first_contact'),
  ('41000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'New Profile Lead', '0755 444 444', 'new@example.ro', 'storia', 'storia', now() + interval '1 day', 'first_contact'),
  ('41000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Ambiguous Lead', '0722111111', null, 'manual', 'manual', now() + interval '1 day', 'first_contact'),
  ('42000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'bbbbbbbb-0000-0000-0000-000000000002', 'Other Agency Lead', '0755 444 444', null, 'manual', 'manual', now() + interval '1 day', 'first_contact');

insert into public.activities(id, agency_id, lead_id, type) values
  ('51000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', 'note');
insert into public.calendar_events(id, agency_id, agent_id, lead_id) values
  ('52000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001');
