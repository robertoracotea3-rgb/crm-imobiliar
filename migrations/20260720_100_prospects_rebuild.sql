begin;

create extension if not exists pg_trgm;

alter table public.prospects add column if not exists county text;
alter table public.prospects add column if not exists source_normalized text;
alter table public.prospects add column if not exists canonical_url text;
alter table public.prospects add column if not exists title_normalized text;
alter table public.prospects add column if not exists price_normalized numeric;
alter table public.prospects add column if not exists county_normalized text;
alter table public.prospects add column if not exists city_normalized text;
alter table public.prospects add column if not exists phone_normalized text;
alter table public.prospects add column if not exists surface_area numeric;
alter table public.prospects add column if not exists similarity_key text;
alter table public.prospects add column if not exists search_text text not null default '';
alter table public.prospects add column if not exists last_checked_at timestamptz;
alter table public.prospects add column if not exists sync_error text;
alter table public.prospects add column if not exists missing_count integer not null default 0;
alter table public.prospects add column if not exists processed_at timestamptz;
alter table public.prospects add column if not exists status_changed_at timestamptz not null default now();
alter table public.prospects add column if not exists status_before_system text;
alter table public.prospects add column if not exists duplicate_group_key text;
alter table public.prospects add column if not exists duplicate_confidence numeric;
alter table public.prospects add column if not exists duplicate_reasons jsonb not null default '[]'::jsonb;
alter table public.prospects add column if not exists agency_suspected boolean not null default false;
alter table public.prospects add column if not exists agency_confidence numeric not null default 0;
alter table public.prospects add column if not exists agency_reasons jsonb not null default '[]'::jsonb;
alter table public.prospects add column if not exists deleted_at timestamptz;
alter table public.prospects add column if not exists deleted_by uuid references auth.users(id);

create or replace function public.crm_prospect_match_key(p_value text)
returns text
language sql
immutable
parallel safe
as $$
  select nullif(trim(regexp_replace(
    replace(replace(replace(replace(replace(replace(replace(
      lower(coalesce(p_value, '')),
      chr(259), 'a'), chr(226), 'a'), chr(238), 'i'), chr(537), 's'),
      chr(351), 's'), chr(539), 't'), chr(355), 't'),
    '[^a-z0-9]+', ' ', 'g'
  )), '')
$$;

update public.prospects
set source_normalized = coalesce(public.crm_prospect_match_key(source), 'unknown'),
    canonical_url = nullif(trim(url), ''),
    title_normalized = public.crm_prospect_match_key(title),
    price_normalized = price,
    county = coalesce(nullif(trim(county), ''), 'Brașov'),
    county_normalized = public.crm_prospect_match_key(coalesce(county, 'Brașov')),
    city_normalized = public.crm_prospect_match_key(city),
    search_text = coalesce(public.crm_prospect_match_key(concat_ws(' ', title, seller_name, city, zone, phone, source)), ''),
    similarity_key = case
      when public.crm_prospect_match_key(title) is not null and price is not null and public.crm_prospect_match_key(city) is not null
      then concat_ws('|', public.crm_prospect_match_key(title), round(price)::text, public.crm_prospect_match_key(city), coalesce(category, ''),
        case when surface_area is not null then round(surface_area)::text else '' end)
      else null end,
    last_checked_at = coalesce(last_checked_at, last_seen_at),
    status = case
      when status in ('contacted','interested','rejected','removed','duplicate','agency_suspected','imported_to_portfolio') then status
      when status = 'contactat' then 'contacted'
      when status = 'refuzat' then 'rejected'
      when status = 'mandat' then 'imported_to_portfolio'
      when coalesce(last_seen_at, first_seen_at, now()) < now() - interval '7 days' then 'stale'
      when coalesce(first_seen_at, now()) >= now() - interval '72 hours' then 'new'
      else 'active'
    end,
    processed_at = case when status in ('contactat','refuzat','mandat','contacted','interested','rejected','imported_to_portfolio')
      then coalesce(processed_at, now()) else processed_at end,
    phone_normalized = nullif(regexp_replace(coalesce(phone, ''), '[^0-9]+', '', 'g'), '');

update public.prospects
set agency_suspected = true,
    agency_confidence = greatest(agency_confidence, 45),
    agency_reasons = jsonb_build_array('termeni comerciali specifici unei agenții'),
    status = case when status in ('new','active') then 'agency_suspected' else status end
where search_text ~ '(^| )(agentie|imobiliare|realtor|broker|intermediere|consultant imobiliar)( |$)';

alter table public.prospects alter column status set default 'new';
alter table public.prospects drop constraint if exists prospects_status_check;
alter table public.prospects add constraint prospects_status_check check (status in (
  'new','active','contacted','interested','rejected','stale','removed','duplicate','agency_suspected','imported_to_portfolio'
));
alter table public.prospects drop constraint if exists prospects_missing_count_check;
alter table public.prospects add constraint prospects_missing_count_check check (missing_count >= 0);
alter table public.prospects drop constraint if exists prospects_agency_confidence_check;
alter table public.prospects add constraint prospects_agency_confidence_check check (agency_confidence between 0 and 100);
alter table public.prospects drop constraint if exists prospects_duplicate_confidence_check;
alter table public.prospects add constraint prospects_duplicate_confidence_check check (duplicate_confidence is null or duplicate_confidence between 0 and 1);

create or replace function public.crm_sync_prospect_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.source_normalized := coalesce(public.crm_prospect_match_key(new.source), 'unknown');
  new.title_normalized := public.crm_prospect_match_key(new.title);
  new.price_normalized := new.price;
  new.county := coalesce(nullif(trim(new.county), ''), 'Brașov');
  new.county_normalized := public.crm_prospect_match_key(new.county);
  new.city_normalized := public.crm_prospect_match_key(new.city);
  new.phone_normalized := nullif(regexp_replace(coalesce(new.phone, ''), '[^0-9]+', '', 'g'), '');
  new.search_text := coalesce(public.crm_prospect_match_key(concat_ws(' ', new.title, new.seller_name, new.city, new.zone, new.phone, new.source)), '');
  new.similarity_key := case
    when new.title_normalized is not null and new.price_normalized is not null and new.city_normalized is not null
    then concat_ws('|', new.title_normalized, round(new.price_normalized)::text, new.city_normalized,
      coalesce(new.category, ''), case when new.surface_area is not null then round(new.surface_area)::text else '' end)
    else null end;
  if tg_op = 'INSERT' and new.agency_suspected and new.status in ('new','active') then
    new.status := 'agency_suspected';
  elsif tg_op = 'UPDATE' and new.agency_suspected and not old.agency_suspected and old.status in ('new','active') then
    new.status := 'agency_suspected';
  elsif tg_op = 'UPDATE' and not new.agency_suspected and old.agency_suspected and old.status = 'agency_suspected' then
    new.status := 'active';
  end if;
  if tg_op = 'UPDATE' and new.status is distinct from old.status then
    new.status_changed_at := now();
    if new.status in ('contacted','interested','rejected','imported_to_portfolio') then
      new.processed_at := coalesce(new.processed_at, now());
    end if;
  end if;
  if tg_op = 'UPDATE' and new.last_seen_at > old.last_seen_at then
    new.missing_count := 0;
    new.sync_error := null;
    if old.status in ('removed','stale') then
      new.status := coalesce(old.status_before_system, 'active');
      new.status_before_system := null;
    elsif old.status = 'new' and old.first_seen_at < now() - interval '72 hours' then
      new.status := 'active';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_sync_prospect_fields_trigger on public.prospects;
create trigger crm_sync_prospect_fields_trigger
before insert or update on public.prospects
for each row execute function public.crm_sync_prospect_fields();

create table if not exists public.prospect_source_health (
  agency_id uuid not null references public.agencies(id) on delete cascade,
  source text not null,
  label text not null,
  active boolean not null default true,
  terms_url text,
  compliance_status text not null default 'review_required'
    check (compliance_status in ('review_required','approved','paused')),
  compliance_note text,
  compliance_reviewed_at timestamptz,
  compliance_reviewed_by uuid references auth.users(id),
  last_run_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  last_duration_ms integer,
  last_processed_count integer not null default 0,
  success_count integer not null default 0,
  error_count integer not null default 0,
  consecutive_failures integer not null default 0,
  last_run_complete boolean,
  updated_at timestamptz not null default now(),
  primary key (agency_id, source)
);

create table if not exists public.prospect_sync_runs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  source text not null,
  initiated_by uuid references auth.users(id),
  status text not null check (status in ('running','succeeded','partial','failed','skipped')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  processed_count integer not null default 0,
  missing_count integer not null default 0,
  error text,
  warnings jsonb not null default '[]'::jsonb
);

insert into public.prospect_source_health(agency_id, source, label, active, terms_url, compliance_status, compliance_note)
select a.id, source.key, source.label, true, source.terms_url, 'review_required',
  'Condițiile portalului trebuie aprobate de titular înaintea automatizării în producție.'
from public.agencies a
cross join (values
  ('olx','OLX','https://ajutor.olx.ro/olxhelpro/s/article/condi%C8%9Bii-de-utilizare-V31'),
  ('publi24','Publi24','https://ajutor.publi24.ro/reguli-adaugare-anunt/')
) as source(key, label, terms_url)
on conflict (agency_id, source) do update set
  label = excluded.label,
  terms_url = excluded.terms_url,
  updated_at = now();

create index if not exists idx_prospects_server_page on public.prospects(agency_id, status, last_seen_at desc) where deleted_at is null;
create index if not exists idx_prospects_source_page on public.prospects(agency_id, source_normalized, last_seen_at desc) where deleted_at is null;
create index if not exists idx_prospects_city_page on public.prospects(agency_id, city_normalized, last_seen_at desc) where deleted_at is null;
create index if not exists idx_prospects_category_page on public.prospects(agency_id, category, last_seen_at desc) where deleted_at is null;
create index if not exists idx_prospects_transaction_page on public.prospects(agency_id, transaction, last_seen_at desc) where deleted_at is null;
create index if not exists idx_prospects_canonical_url on public.prospects(agency_id, canonical_url) where canonical_url is not null and deleted_at is null;
create index if not exists idx_prospects_phone_normalized on public.prospects(agency_id, phone_normalized) where phone_normalized is not null and deleted_at is null;
create index if not exists idx_prospects_duplicate_group on public.prospects(agency_id, duplicate_group_key) where duplicate_group_key is not null and deleted_at is null;
create index if not exists idx_prospects_search_trgm on public.prospects using gin(search_text gin_trgm_ops);
create index if not exists idx_prospect_sync_runs_source on public.prospect_sync_runs(agency_id, source, started_at desc);

create or replace function public.crm_mark_missing_prospects(
  p_agency_id uuid, p_source text, p_seen_external_ids text[], p_checked_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare affected integer;
begin
  update public.prospects p
  set missing_count = p.missing_count + 1,
      last_checked_at = p_checked_at,
      status_before_system = case
        when p.status not in ('new','active','stale','removed','duplicate','agency_suspected') then p.status
        else p.status_before_system end,
      status = case when p.missing_count + 1 >= 2 then 'removed' else 'stale' end,
      status_changed_at = case
        when p.status is distinct from (case when p.missing_count + 1 >= 2 then 'removed' else 'stale' end)
        then now() else p.status_changed_at end
  where p.agency_id = p_agency_id
    and p.source_normalized = public.crm_prospect_match_key(p_source)
    and p.deleted_at is null
    and not (p.external_id = any(coalesce(p_seen_external_ids, '{}'::text[])));
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.crm_refresh_prospect_duplicate_groups(p_agency_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare affected integer;
begin
  drop table if exists pg_temp.crm_prospect_groups;
  create temporary table crm_prospect_groups on commit drop as
  with candidates as (
    select p.id, 'url:' || md5(p.canonical_url) group_key, 1.0::numeric confidence,
      'URL canonic identic'::text reason, 1 priority
    from public.prospects p
    join (select canonical_url from public.prospects where agency_id = p_agency_id and deleted_at is null and canonical_url is not null group by canonical_url having count(*) > 1) g using(canonical_url)
    where p.agency_id = p_agency_id and p.deleted_at is null
    union all
    select p.id, 'phone:' || md5(p.phone_normalized), .95::numeric,
      'număr de telefon identic', 2
    from public.prospects p
    join (select phone_normalized from public.prospects where agency_id = p_agency_id and deleted_at is null and phone_normalized is not null group by phone_normalized having count(*) > 1) g using(phone_normalized)
    where p.agency_id = p_agency_id and p.deleted_at is null
    union all
    select p.id, 'similar:' || md5(p.similarity_key), .75::numeric,
      'titlu, preț și localitate identice în surse diferite', 3
    from public.prospects p
    join (
      select similarity_key from public.prospects
      where agency_id = p_agency_id and deleted_at is null and similarity_key is not null
      group by similarity_key having count(*) > 1 and count(distinct source_normalized) > 1
    ) g using(similarity_key)
    where p.agency_id = p_agency_id and p.deleted_at is null
  ), selected as (
    select distinct on (id) id, group_key, confidence, reason, priority
    from candidates order by id, priority
  )
  select *, row_number() over(partition by group_key order by id) member_order from selected;

  update public.prospects p
  set duplicate_group_key = null, duplicate_confidence = null, duplicate_reasons = '[]'::jsonb,
      status = case when p.status = 'duplicate' then 'active' else p.status end
  where p.agency_id = p_agency_id and p.deleted_at is null and p.duplicate_group_key is not null;

  update public.prospects p
  set duplicate_group_key = g.group_key,
      duplicate_confidence = g.confidence,
      duplicate_reasons = jsonb_build_array(g.reason),
      status = case
        when g.confidence >= .95 and g.member_order > 1 and p.status in ('new','active','stale','agency_suspected') then 'duplicate'
        else p.status end
  from crm_prospect_groups g where p.id = g.id;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

revoke all on function public.crm_mark_missing_prospects(uuid,text,text[],timestamptz) from public, anon, authenticated;
revoke all on function public.crm_refresh_prospect_duplicate_groups(uuid) from public, anon, authenticated;
grant execute on function public.crm_mark_missing_prospects(uuid,text,text[],timestamptz) to service_role;
grant execute on function public.crm_refresh_prospect_duplicate_groups(uuid) to service_role;

alter table public.prospect_source_health enable row level security;
alter table public.prospect_sync_runs enable row level security;
revoke all on public.prospect_source_health, public.prospect_sync_runs from anon;
grant select on public.prospect_source_health, public.prospect_sync_runs to authenticated;

drop policy if exists crm_prospect_source_health_select on public.prospect_source_health;
create policy crm_prospect_source_health_select on public.prospect_source_health
for select to authenticated using (
  agency_id = public.current_crm_agency_id() and public.crm_has_permission('prospects','view')
);
drop policy if exists crm_prospect_sync_runs_select on public.prospect_sync_runs;
create policy crm_prospect_sync_runs_select on public.prospect_sync_runs
for select to authenticated using (
  agency_id = public.current_crm_agency_id() and public.crm_has_permission('prospects','view')
);

-- The prospect pool is shared while unassigned. Editing an unassigned row claims
-- it for the current agent; managers retain agency-wide access.
drop policy if exists crm_prospects_select on public.prospects;
create policy crm_prospects_select on public.prospects for select to authenticated using (
  agency_id = public.current_crm_agency_id()
  and public.crm_has_permission('prospects','view')
  and (assigned_to is null or public.crm_can_access_row('prospects', array[assigned_to]::uuid[]))
);
drop policy if exists crm_prospects_update on public.prospects;
create policy crm_prospects_update on public.prospects for update to authenticated using (
  agency_id = public.current_crm_agency_id()
  and public.crm_has_permission('prospects','edit')
  and (assigned_to is null or public.crm_can_access_row('prospects', array[assigned_to]::uuid[]))
) with check (
  agency_id = public.current_crm_agency_id()
  and public.crm_has_permission('prospects','edit')
  and (public.crm_has_permission('prospects','manage_all') or public.crm_has_permission('prospects','assign') or assigned_to = auth.uid())
);

commit;
