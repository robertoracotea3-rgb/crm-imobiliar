alter table public.leads add column if not exists status text default 'new';
alter table public.leads add column if not exists source text;
alter table public.leads add column if not exists source_normalized text;
alter table public.leads add column if not exists property_id uuid;
alter table public.leads add column if not exists received_at timestamptz default now();
alter table public.leads add column if not exists association_status text;
alter table public.leads add column if not exists deleted_at timestamptz;
alter table public.properties add column if not exists status text default 'draft';
alter table public.calendar_events add column if not exists type text;
alter table public.calendar_events add column if not exists status text;
alter table public.transactions add column if not exists status text;
alter table public.transactions add column if not exists closed_at date;
alter table public.demands add column if not exists status text default 'activa';
alter table public.demands add column if not exists source text;
alter table public.activities add column if not exists type text;

insert into public.leads(id, agency_id, agent_id, status, source) values
  ('51000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'new', 'Storia.ro + Olx.ro'),
  ('51000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'replied', 'Website')
on conflict (id) do nothing;

update public.leads set association_status='pending' where id::text like '51000000-%';

create index if not exists leads_unmatched_storia_idx
  on public.leads(agency_id, received_at desc)
  where property_id is null and association_status='pending'
    and source_normalized in ('storia','olx') and deleted_at is null;

insert into public.leads(id, agency_id, agent_id, status, source, source_normalized) values
  ('51000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'new', null, 'referral')
on conflict (id) do nothing;

insert into public.properties(id, agency_id, agent_id, title, status) values
  ('51000000-0000-0000-0000-000000000010', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'Legacy property', 'active')
on conflict (id) do nothing;

insert into public.calendar_events(id, agency_id, agent_id, created_by, type, status) values
  ('51000000-0000-0000-0000-000000000020', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'vizionare', null)
on conflict (id) do nothing;

insert into public.transactions(id, agency_id, agent_id, created_by, sale_price, closed_at, status) values
  ('51000000-0000-0000-0000-000000000030', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 99000, current_date, null)
on conflict (id) do nothing;

insert into public.demands(id, agency_id, agent_id, status, source) values
  ('51000000-0000-0000-0000-000000000040', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'activa', 'Prieteni/Cunostinte')
on conflict (id) do nothing;

insert into public.activities(id, agency_id, agent_id, user_id, type) values
  ('51000000-0000-0000-0000-000000000050', '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001', 'created')
on conflict (id) do nothing;
