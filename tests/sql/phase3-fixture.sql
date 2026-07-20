alter table public.leads add column if not exists status text not null default 'new';
alter table public.leads add column if not exists first_response_at timestamptz;

create table if not exists public.activities (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  user_id uuid,
  lead_id uuid references public.leads(id),
  type text not null,
  title text not null,
  description text,
  created_at timestamptz not null default now()
);

insert into public.leads(id, agency_id, status)
values (
  '90000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'new'
)
on conflict (id) do update set
  status = 'new',
  first_response_at = null;

delete from public.activities
where lead_id = '90000000-0000-4000-8000-000000000001';
