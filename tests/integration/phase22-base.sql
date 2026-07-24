\set ON_ERROR_STOP on

create extension if not exists pgcrypto;
create schema if not exists auth;

create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);

create table auth.sessions (
  id uuid primary key,
  user_id uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table auth.mfa_factors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  status text not null,
  factor_type text not null default 'totp'
);

create or replace function auth.jwt()
returns jsonb language sql stable
as $$ select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb, '{}'::jsonb) $$;

create or replace function auth.uid()
returns uuid language sql stable
as $$ select nullif(auth.jwt() ->> 'sub', '')::uuid $$;

create table public.agencies (
  id uuid primary key,
  name text not null
);

create table public.profiles (
  user_id uuid not null references auth.users(id),
  agency_id uuid not null references public.agencies(id),
  role text not null default 'agent',
  full_name text,
  permissions jsonb,
  status text not null default 'active',
  primary key (user_id, agency_id)
);

create table public.properties (
  id uuid primary key,
  agency_id uuid not null references public.agencies(id),
  agent_id uuid references auth.users(id),
  internal_code text,
  title text,
  city text,
  county text,
  category text,
  price numeric,
  currency text default 'EUR',
  attributes jsonb not null default '{}'::jsonb,
  status text not null default 'activa',
  deleted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.contacts (
  id uuid primary key,
  agency_id uuid not null references public.agencies(id),
  full_name text not null,
  phone text,
  merge_status text not null default 'active',
  deleted_at timestamptz
);

create table public.activity_types (
  code text primary key,
  display_name text not null,
  display_order integer not null,
  category text not null,
  ui_color text not null,
  is_active boolean not null default true
);

create table public.leads (
  id uuid primary key,
  agency_id uuid not null references public.agencies(id),
  contact_name text,
  contact_phone text,
  contact_email text,
  contact_id uuid references public.contacts(id),
  agent_id uuid references auth.users(id),
  status text not null default 'new',
  pipeline_stage text not null default 'lead_nou',
  pipeline_stage_changed_at timestamptz not null default now(),
  next_action_at timestamptz,
  next_action_type text,
  property_id uuid references public.properties(id),
  property_title text,
  source text,
  source_normalized text,
  association_status text,
  first_response_at timestamptz,
  last_contact_attempt_at timestamptz,
  last_contacted_at timestamptz,
  last_contact_channel text,
  received_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.property_photos (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  property_id uuid not null references public.properties(id),
  public_url text,
  storage_path text,
  is_cover boolean not null default false,
  sort_order integer not null default 0,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  created_by uuid references auth.users(id),
  type text not null,
  title text not null,
  start_at timestamptz not null,
  end_at timestamptz,
  description text,
  contact_name text,
  contact_phone text,
  contact_id uuid references public.contacts(id),
  property_id uuid references public.properties(id),
  agent_id uuid references auth.users(id),
  status text not null default 'programata',
  completed boolean not null default false,
  outcome text,
  deleted_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.activities (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  user_id uuid references auth.users(id),
  agent_id uuid references auth.users(id),
  lead_id uuid references public.leads(id),
  contact_id uuid references public.contacts(id),
  property_id uuid references public.properties(id),
  type text not null,
  title text not null,
  description text,
  scheduled_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.lead_pipeline_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  lead_id uuid not null references public.leads(id),
  from_stage text,
  to_stage text not null,
  reason text,
  note text,
  source text not null,
  actor_id uuid references auth.users(id),
  evidence jsonb not null default '{}'::jsonb,
  dedup_key text,
  created_at timestamptz not null default now(),
  unique(agency_id, lead_id, dedup_key)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  created_by uuid references auth.users(id),
  assigned_to uuid references auth.users(id),
  title text not null,
  description text,
  priority text,
  status text,
  due_at timestamptz,
  property_id uuid references public.properties(id),
  lead_id uuid references public.leads(id),
  created_at timestamptz not null default now()
);

create table public.demands (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  contact_id uuid references public.contacts(id),
  agent_id uuid references auth.users(id),
  internal_code text,
  source text,
  source_normalized text,
  criteria jsonb not null default '{}'::jsonb,
  category text,
  transaction text,
  budget_min numeric,
  budget_max numeric,
  currency text default 'EUR',
  counties text[] not null default '{}'::text[],
  cities text[] not null default '{}'::text[],
  zones text[] not null default '{}'::text[],
  notes text,
  intent text,
  budget_unknown boolean not null default false,
  property_types text[] not null default '{}'::text[],
  radius_km numeric,
  rooms_min numeric,
  rooms_max numeric,
  usable_area_min numeric,
  usable_area_max numeric,
  land_area_min numeric,
  land_area_max numeric,
  floor_preferences text[] not null default '{}'::text[],
  furnished_preference text,
  parking_required boolean not null default false,
  financing text,
  deadline_date date,
  special_requirements text,
  county_match_keys text[] not null default '{}'::text[],
  city_match_keys text[] not null default '{}'::text[],
  zone_match_keys text[] not null default '{}'::text[],
  status text not null default 'activa',
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  demand_id uuid not null references public.demands(id),
  property_id uuid not null references public.properties(id),
  score numeric not null default 0,
  status text not null default 'noua',
  created_at timestamptz not null default now()
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  property_id uuid references public.properties(id),
  contact_id uuid references public.contacts(id),
  agent_id uuid references auth.users(id),
  type text not null default 'vanzare',
  status text not null default 'draft',
  status_reason text,
  sale_price numeric(14,2),
  currency text not null default 'EUR',
  agency_commission numeric(14,2) not null default 0,
  agent_commission numeric(14,2) not null default 0,
  reservation_at timestamptz,
  reservation_amount numeric(14,2),
  closed_at date,
  notes text,
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.portal_listings (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  property_id uuid not null references public.properties(id),
  portal text not null,
  external_id text,
  status text not null,
  error_message text,
  last_sync_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.portal_unmatched_messages (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id),
  portal text not null default 'storia',
  portal_ad_id text,
  sender_name text,
  reason text not null,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create table public.transaction_statuses (
  code text primary key,
  display_name text not null,
  display_order integer not null,
  category text not null,
  ui_color text not null,
  is_active boolean not null,
  is_terminal boolean not null,
  requires_next_action boolean not null
);

create table public.crm_status_transitions (
  entity_type text not null,
  from_code text not null,
  to_code text not null,
  primary key (entity_type, from_code, to_code)
);

create table public.activity_logs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  user_id uuid,
  action text not null,
  field text,
  old_value text,
  new_value text,
  created_at timestamptz not null default now()
);

create or replace function public.current_crm_agency_id()
returns uuid language sql stable as $$
  select agency_id
  from public.profiles
  where user_id = auth.uid()
    and coalesce(status, 'active') = 'active'
  limit 1
$$;

create or replace function public.crm_has_permission(text, text)
returns boolean language sql stable as $$ select true $$;

create or replace function public.crm_can_access_row(text, uuid[])
returns boolean language sql stable as $$ select true $$;

create or replace function public.crm_enqueue_notification(
  uuid, uuid, text, text, text, text, text, text, text, text, jsonb
) returns uuid language sql as $$ select gen_random_uuid() $$;
