begin;

-- Phase 8 keeps the historical demands table and makes its criteria explicit,
-- queryable and explainable. Existing JSON criteria remain available.
alter table public.demands add column if not exists criteria jsonb not null default '{}'::jsonb;
alter table public.demands add column if not exists status text not null default 'activa';
alter table public.demands add column if not exists category text;
alter table public.demands add column if not exists transaction text;
alter table public.demands add column if not exists budget_min numeric;
alter table public.demands add column if not exists budget_max numeric;
alter table public.demands add column if not exists currency text default 'EUR';
alter table public.demands add column if not exists counties text[];
alter table public.demands add column if not exists cities text[];
alter table public.demands add column if not exists zones text[];
alter table public.demands add column if not exists notes text;
alter table public.demands add column if not exists updated_at timestamptz not null default now();
alter table public.demands add column if not exists intent text;
alter table public.demands add column if not exists budget_unknown boolean not null default false;
alter table public.demands add column if not exists property_types text[];
alter table public.demands add column if not exists radius_km numeric;
alter table public.demands add column if not exists rooms_min numeric;
alter table public.demands add column if not exists rooms_max numeric;
alter table public.demands add column if not exists usable_area_min numeric;
alter table public.demands add column if not exists usable_area_max numeric;
alter table public.demands add column if not exists land_area_min numeric;
alter table public.demands add column if not exists land_area_max numeric;
alter table public.demands add column if not exists floor_preferences text[];
alter table public.demands add column if not exists furnished_preference text;
alter table public.demands add column if not exists parking_required boolean not null default false;
alter table public.demands add column if not exists financing text;
alter table public.demands add column if not exists deadline_date date;
alter table public.demands add column if not exists special_requirements text;
alter table public.demands add column if not exists county_match_keys text[] not null default '{}'::text[];
alter table public.demands add column if not exists city_match_keys text[] not null default '{}'::text[];
alter table public.demands add column if not exists zone_match_keys text[] not null default '{}'::text[];

-- The filter columns mirror already existing property data. ADD IF NOT EXISTS
-- also lets the migration run against older staging snapshots.
alter table public.properties add column if not exists transaction text;
alter table public.properties add column if not exists county text;
alter table public.properties add column if not exists zone text;
alter table public.properties add column if not exists price numeric;
alter table public.properties add column if not exists currency text default 'EUR';
alter table public.properties add column if not exists latitude numeric;
alter table public.properties add column if not exists longitude numeric;
alter table public.properties add column if not exists surface_useful numeric;
alter table public.properties add column if not exists surface_land numeric;
alter table public.properties add column if not exists updated_at timestamptz not null default now();
alter table public.properties add column if not exists county_match_key text;
alter table public.properties add column if not exists city_match_key text;
alter table public.properties add column if not exists zone_match_key text;

create or replace function public.crm_match_key(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(trim(regexp_replace(
    replace(replace(replace(replace(replace(replace(replace(replace(
      lower(coalesce(p_value, '')),
      chr(259), 'a'), chr(226), 'a'), chr(238), 'i'), chr(537), 's'),
      chr(351), 's'), chr(539), 't'), chr(355), 't'), chr(227), 'a'),
    '[^a-z0-9]+', ' ', 'g'
  )), '')
$$;

create or replace function public.crm_match_key_array(p_values text[])
returns text[]
language sql
immutable
parallel safe
as $$
  select coalesce(array_agg(distinct key order by key) filter(where key is not null), '{}'::text[])
  from (
    select public.crm_match_key(value) as key
    from unnest(coalesce(p_values, '{}'::text[])) as value
  ) normalized
$$;

update public.demands
set intent = case
      when intent in ('cumparare', 'inchiriere', 'vanzare', 'oferire_inchiriere') then intent
      when transaction = 'inchiriere' then 'inchiriere'
      else 'cumparare'
    end,
    budget_unknown = case
      when budget_min is null and budget_max is null then true
      else coalesce(budget_unknown, false)
    end,
    property_types = case
      when coalesce(cardinality(property_types), 0) > 0 then property_types
      when category is not null then array[category::text]
      else '{}'::text[]
    end,
    rooms_min = coalesce(rooms_min,
      case when jsonb_typeof(criteria -> 'nr_camere_min') = 'number' then (criteria ->> 'nr_camere_min')::numeric end,
      case when jsonb_typeof(criteria -> 'nr_camere') = 'number' then (criteria ->> 'nr_camere')::numeric end),
    rooms_max = coalesce(rooms_max,
      case when jsonb_typeof(criteria -> 'nr_camere_max') = 'number' then (criteria ->> 'nr_camere_max')::numeric end),
    usable_area_min = coalesce(usable_area_min,
      case when jsonb_typeof(criteria -> 'suprafata_min') = 'number' then (criteria ->> 'suprafata_min')::numeric end,
      case when jsonb_typeof(criteria -> 'sup_utila') = 'number' then (criteria ->> 'sup_utila')::numeric end),
    usable_area_max = coalesce(usable_area_max,
      case when jsonb_typeof(criteria -> 'suprafata_max') = 'number' then (criteria ->> 'suprafata_max')::numeric end),
    land_area_min = coalesce(land_area_min,
      case when jsonb_typeof(criteria -> 'teren_min') = 'number' then (criteria ->> 'teren_min')::numeric end,
      case when jsonb_typeof(criteria -> 'sup_teren') = 'number' then (criteria ->> 'sup_teren')::numeric end),
    land_area_max = coalesce(land_area_max,
      case when jsonb_typeof(criteria -> 'teren_max') = 'number' then (criteria ->> 'teren_max')::numeric end),
    county_match_keys = public.crm_match_key_array(counties),
    city_match_keys = public.crm_match_key_array(cities),
    zone_match_keys = public.crm_match_key_array(zones),
    updated_at = coalesce(updated_at, created_at, now());

update public.properties
set county_match_key = public.crm_match_key(coalesce(county, attributes ->> 'judet')),
    city_match_key = public.crm_match_key(coalesce(city, attributes ->> 'localitate', attributes ->> 'oras')),
    zone_match_key = public.crm_match_key(coalesce(zone, attributes ->> 'zona', attributes ->> 'cartier'));

alter table public.demands alter column intent set default 'cumparare';
alter table public.demands alter column intent set not null;
alter table public.demands alter column property_types set default '{}'::text[];
alter table public.demands alter column property_types set not null;

create or replace function public.crm_sync_demand_match_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.intent := case
    when new.intent in ('cumparare', 'inchiriere', 'vanzare', 'oferire_inchiriere') then new.intent
    when new.transaction = 'inchiriere' then 'inchiriere'
    else 'cumparare'
  end;
  new.transaction := case when new.intent in ('inchiriere', 'oferire_inchiriere') then 'inchiriere' else 'vanzare' end;
  new.property_types := case
    when coalesce(cardinality(new.property_types), 0) > 0 then new.property_types
    when new.category is not null then array[new.category::text]
    else '{}'::text[]
  end;
  if new.budget_unknown then
    new.budget_min := null;
    new.budget_max := null;
  end if;
  new.county_match_keys := public.crm_match_key_array(new.counties);
  new.city_match_keys := public.crm_match_key_array(new.cities);
  new.zone_match_keys := public.crm_match_key_array(new.zones);
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists crm_sync_demand_match_fields_trigger on public.demands;
create trigger crm_sync_demand_match_fields_trigger
before insert or update of intent, transaction, property_types, category, budget_unknown,
  budget_min, budget_max, counties, cities, zones
on public.demands for each row execute function public.crm_sync_demand_match_fields();

create or replace function public.crm_sync_property_match_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.county_match_key := public.crm_match_key(coalesce(new.county, new.attributes ->> 'judet'));
  new.city_match_key := public.crm_match_key(coalesce(new.city, new.attributes ->> 'localitate', new.attributes ->> 'oras'));
  new.zone_match_key := public.crm_match_key(coalesce(new.zone, new.attributes ->> 'zona', new.attributes ->> 'cartier'));
  return new;
end;
$$;

drop trigger if exists crm_sync_property_match_fields_trigger on public.properties;
create trigger crm_sync_property_match_fields_trigger
before insert or update of county, city, zone, attributes
on public.properties for each row execute function public.crm_sync_property_match_fields();

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'demands_intent_check') then
    alter table public.demands add constraint demands_intent_check
      check(intent in ('cumparare', 'inchiriere', 'vanzare', 'oferire_inchiriere')) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'demands_budget_range_check') then
    alter table public.demands add constraint demands_budget_range_check
      check(budget_unknown or budget_min is not null or budget_max is not null) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'demands_budget_order_check') then
    alter table public.demands add constraint demands_budget_order_check
      check(budget_min is null or budget_max is null or budget_min <= budget_max) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'demands_numeric_ranges_check') then
    alter table public.demands add constraint demands_numeric_ranges_check check(
      (rooms_min is null or rooms_max is null or rooms_min <= rooms_max)
      and (usable_area_min is null or usable_area_max is null or usable_area_min <= usable_area_max)
      and (land_area_min is null or land_area_max is null or land_area_min <= land_area_max)
      and (radius_km is null or radius_km between 0 and 250)
    ) not valid;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'demands_property_types_check') then
    alter table public.demands add constraint demands_property_types_check check(
      cardinality(property_types) > 0
      and property_types <@ array['apartament','casa_vila','spatiu_comercial','spatiu_industrial','teren','pensiune_hotel','birou','garaj']::text[]
    ) not valid;
  end if;
end $$;
alter table public.demands validate constraint demands_intent_check;
alter table public.demands validate constraint demands_budget_range_check;
alter table public.demands validate constraint demands_budget_order_check;
alter table public.demands validate constraint demands_numeric_ranges_check;
alter table public.demands validate constraint demands_property_types_check;

create index if not exists demands_match_status_idx on public.demands(agency_id, status, transaction, updated_at desc)
  where deleted_at is null;
create index if not exists demands_property_types_gin_idx on public.demands using gin(property_types);
create index if not exists demands_city_keys_gin_idx on public.demands using gin(city_match_keys);
create index if not exists demands_county_keys_gin_idx on public.demands using gin(county_match_keys);
create index if not exists demands_zone_keys_gin_idx on public.demands using gin(zone_match_keys);
create index if not exists properties_match_filter_idx on public.properties(
  agency_id, status, transaction, category, city_match_key, price
) where deleted_at is null;

create table if not exists public.matches (
  id uuid primary key default gen_random_uuid(),
  demand_id uuid not null references public.demands(id),
  property_id uuid not null references public.properties(id),
  score numeric not null,
  status text not null default 'noua',
  proposed_at timestamptz,
  sent_at timestamptz,
  sent_via text,
  feedback text,
  created_at timestamptz not null default now()
);
alter table public.matches add column if not exists agency_id uuid references public.agencies(id);
alter table public.matches add column if not exists details jsonb not null default '{}'::jsonb;
alter table public.matches add column if not exists price_difference numeric;
alter table public.matches add column if not exists score_version text;
alter table public.matches add column if not exists coverage numeric;
alter table public.matches add column if not exists evaluated_at timestamptz not null default now();
alter table public.matches add column if not exists requires_agent_confirmation boolean not null default true;
alter table public.matches add column if not exists agent_confirmed_at timestamptz;
alter table public.matches add column if not exists agent_confirmed_by uuid references auth.users(id);
alter table public.matches add column if not exists updated_at timestamptz not null default now();

update public.matches m set agency_id = d.agency_id
from public.demands d where d.id = m.demand_id and m.agency_id is null;
update public.matches m
set agent_confirmed_at = coalesce(m.agent_confirmed_at, m.sent_at),
    agent_confirmed_by = coalesce(m.agent_confirmed_by, d.agent_id)
from public.demands d
where d.id = m.demand_id and m.sent_at is not null and m.agent_confirmed_at is null;

create unique index if not exists matches_agency_demand_property_uidx
  on public.matches(agency_id, demand_id, property_id);
create index if not exists matches_agent_alert_idx
  on public.matches(agency_id, status, created_at desc);

create or replace function public.crm_validate_match_write()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  demand_agency uuid;
  property_agency uuid;
begin
  select agency_id into demand_agency from public.demands where id = new.demand_id;
  select agency_id into property_agency from public.properties where id = new.property_id;
  if demand_agency is null or property_agency is null or demand_agency <> property_agency then
    raise exception 'cross_agency_match_rejected';
  end if;
  new.agency_id := demand_agency;
  if new.sent_at is not null and new.agent_confirmed_at is null then
    raise exception 'agent_confirmation_required_before_send';
  end if;
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists crm_validate_match_write_trigger on public.matches;
create trigger crm_validate_match_write_trigger
before insert or update on public.matches for each row execute function public.crm_validate_match_write();

create table if not exists public.demand_match_refresh_queue (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id),
  property_id uuid not null references public.properties(id),
  reason text not null default 'property_changed',
  status text not null default 'pending',
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  processed_at timestamptz
);
create unique index if not exists demand_match_refresh_pending_uidx
  on public.demand_match_refresh_queue(agency_id, property_id) where status = 'pending';
create index if not exists demand_match_refresh_status_idx
  on public.demand_match_refresh_queue(status, created_at);

create or replace function public.crm_queue_property_matching()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.deleted_at is null and new.status = 'activa' and (
    tg_op = 'INSERT'
    or old.status is distinct from new.status
    or old.category is distinct from new.category
    or old.transaction is distinct from new.transaction
    or old.price is distinct from new.price
    or old.currency is distinct from new.currency
    or old.city_match_key is distinct from new.city_match_key
    or old.county_match_key is distinct from new.county_match_key
    or old.zone_match_key is distinct from new.zone_match_key
    or old.attributes is distinct from new.attributes
  ) then
    insert into public.demand_match_refresh_queue(agency_id, property_id)
    values(new.agency_id, new.id)
    on conflict(agency_id, property_id) where status = 'pending'
    do update set created_at = now(), attempts = 0, last_error = null;
  end if;
  return new;
end;
$$;

revoke all on function public.crm_queue_property_matching()
  from public, anon, authenticated;
grant execute on function public.crm_queue_property_matching()
  to service_role;

drop trigger if exists crm_queue_property_matching_trigger on public.properties;
create trigger crm_queue_property_matching_trigger
after insert or update of status, category, transaction, price, currency, county, city, zone, attributes, deleted_at
on public.properties for each row execute function public.crm_queue_property_matching();

alter table public.matches enable row level security;
alter table public.demand_match_refresh_queue enable row level security;
revoke all on public.matches, public.demand_match_refresh_queue from anon, authenticated;
grant select on public.matches to authenticated;

drop policy if exists crm_matches_select on public.matches;
create policy crm_matches_select on public.matches for select to authenticated using (
  agency_id = public.current_crm_agency_id()
  and public.crm_has_permission('demands', 'view')
  and exists (
    select 1 from public.demands d
    where d.id = public.matches.demand_id and d.agency_id = public.matches.agency_id
      and public.crm_can_access_row('demands', array[d.agent_id]::uuid[])
  )
);

comment on table public.demand_match_refresh_queue is
  'Server-only retry queue. A property change creates work; it never sends a recommendation to a client.';
comment on column public.matches.agent_confirmed_at is
  'Required before sent_at can be set. A calculated match is only an internal recommendation.';

commit;
