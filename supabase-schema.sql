-- Agencies
create table if not exists agencies (
  id uuid default gen_random_uuid() primary key,
  name text not null,
  created_at timestamptz default now()
);

-- Profiles
create table if not exists profiles (
  id uuid default gen_random_uuid() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  agency_id uuid references agencies(id) on delete cascade not null,
  role text default 'agent',
  created_at timestamptz default now()
);

-- Properties
create table if not exists properties (
  id uuid default gen_random_uuid() primary key,
  agency_id uuid references agencies(id) on delete cascade not null,
  user_id uuid references auth.users(id) not null,
  internal_code text not null,
  title text not null,
  location text not null,
  price numeric not null default 0,
  category text not null,
  description text,
  attributes jsonb default '{}',
  status text default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Demands (Cereri)
create table if not exists demands (
  id uuid default gen_random_uuid() primary key,
  agency_id uuid references agencies(id) on delete cascade not null,
  user_id uuid references auth.users(id) not null,
  title text not null,
  location text not null,
  category text not null,
  min_price numeric,
  max_price numeric,
  criteria jsonb default '{}',
  created_at timestamptz default now()
);

-- Leads
create table if not exists leads (
  id uuid default gen_random_uuid() primary key,
  agency_id uuid references agencies(id) on delete cascade,
  contact_name text not null,
  contact_phone text not null,
  contact_email text,
  message text not null,
  property_title text,
  property_id uuid references properties(id),
  status text default 'new',
  received_at timestamptz default now(),
  first_response_at timestamptz
);

-- Message Templates
create table if not exists message_templates (
  id uuid default gen_random_uuid() primary key,
  agency_id uuid references agencies(id) on delete cascade not null,
  name text not null,
  subject text,
  body text not null,
  created_at timestamptz default now()
);

-- Activities
create table if not exists activities (
  id uuid default gen_random_uuid() primary key,
  type text not null,
  description text,
  lead_id uuid references leads(id),
  user_id uuid references auth.users(id),
  created_at timestamptz default now()
);

-- Disable RLS pentru toate tabelele (simplificat pentru MVP)
alter table agencies disable row level security;
alter table profiles disable row level security;
alter table properties disable row level security;
alter table demands disable row level security;
alter table leads disable row level security;
alter table message_templates disable row level security;
alter table activities disable row level security;
