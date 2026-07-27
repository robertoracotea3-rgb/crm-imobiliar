\set ON_ERROR_STOP on

create table if not exists public.crm_role_permissions (
  role text not null,
  module text not null,
  action text not null,
  allowed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (role, module, action)
);

insert into public.crm_role_permissions(role,module,action,allowed)
values ('agent','prospects','view',true)
on conflict (role,module,action) do update set allowed=excluded.allowed;

update public.profiles
set permissions = jsonb_build_object(
  'properties', jsonb_build_object('view', true),
  'prospects', jsonb_build_object('view', true)
)
where user_id = (select user_id from public.profiles order by user_id limit 1);

create table public.prospects (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  title text
);

create table public.prospect_source_health (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id)
);

create table public.prospect_sync_runs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id)
);

create or replace function public.crm_prospect_match_key(p_value text)
returns text language sql immutable as $$ select lower(p_value) $$;

create or replace function public.crm_sync_prospect_fields()
returns trigger language plpgsql as $$
begin
  return new;
end
$$;

create trigger crm_sync_prospect_fields_trigger
before insert or update on public.prospects
for each row execute function public.crm_sync_prospect_fields();

create or replace function public.crm_mark_missing_prospects(
  p_agency_id uuid,
  p_source text,
  p_seen_external_ids text[],
  p_checked_at timestamptz
)
returns integer language sql as $$ select 0 $$;

create or replace function public.crm_refresh_prospect_duplicate_groups(p_agency_id uuid)
returns integer language sql as $$ select 0 $$;
