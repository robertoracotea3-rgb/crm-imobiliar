create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  full_name text,
  phone text,
  deleted_at timestamptz
);

alter table public.leads add column if not exists contact_name text;
alter table public.leads add column if not exists contact_phone text;
alter table public.leads add column if not exists agent_id uuid;

create table if not exists public.profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  agency_id uuid references public.agencies(id),
  role text not null default 'agent'
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  created_by uuid,
  assigned_to uuid,
  title text not null,
  description text,
  priority text default 'medie',
  status text default 'open',
  due_at timestamptz,
  property_id uuid references public.properties(id),
  lead_id uuid references public.leads(id),
  deleted_at timestamptz
);

create table if not exists public.calendar_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  created_by uuid not null,
  title text not null,
  type text not null default 'task',
  start_at timestamptz not null,
  end_at timestamptz,
  description text,
  contact_name text,
  contact_phone text,
  contact_id uuid,
  demand_id uuid,
  property_id uuid,
  agent_id uuid,
  all_day boolean default false,
  completed boolean default false,
  status text,
  outcome text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  deleted_at timestamptz,
  deleted_by uuid
);

alter table public.activities add column if not exists agent_id uuid;
alter table public.activities add column if not exists contact_id uuid;
alter table public.activities add column if not exists property_id uuid;
alter table public.activities add column if not exists scheduled_at timestamptz;

insert into public.profiles(id, user_id, agency_id, role)
values (
  'a0000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'agent'
)
on conflict (id) do nothing;

update public.leads
set status = 'new', next_action_at = null, next_action_type = null,
    contact_name = 'Client test', contact_phone = '0775132969',
    agent_id = '30000000-0000-4000-8000-000000000001'
where id = '90000000-0000-4000-8000-000000000001';

delete from public.calendar_events where agency_id = '10000000-0000-4000-8000-000000000001';
delete from public.tasks where agency_id = '10000000-0000-4000-8000-000000000001';
delete from public.activities where type like 'viewing_%';
