-- Phase 7: canonical client profiles, deterministic reconciliation and reversible merges.
-- Apply after 20260720_070_status_source_catalogs.sql, on staging first.
-- contacts remains the canonical person table; no historical lead/demand row is deleted.

begin;

create or replace function public.crm_normalize_client_phone(p_value text)
returns text
language plpgsql
immutable
strict
as $$
declare
  digits text;
begin
  digits := regexp_replace(trim(p_value), '[^0-9]', '', 'g');
  if left(digits, 2) = '00' then digits := substr(digits, 3); end if;
  if digits ~ '^07[0-9]{8}$' then digits := '4' || digits; end if;
  if digits !~ '^[1-9][0-9]{7,14}$' then return null; end if;
  return digits;
end;
$$;

create or replace function public.crm_normalize_client_email(p_value text)
returns text
language sql
immutable
strict
as $$
  select case
    when length(lower(trim(p_value))) <= 320
      and lower(trim(p_value)) ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
      then lower(trim(p_value))
    else null
  end
$$;

alter table public.contacts add column if not exists normalized_phone text;
alter table public.contacts add column if not exists normalized_phone_secondary text;
alter table public.contacts add column if not exists normalized_email text;
alter table public.contacts add column if not exists merge_status text not null default 'active';
alter table public.contacts add column if not exists merged_into_id uuid references public.contacts(id);
alter table public.contacts add column if not exists merged_at timestamptz;
alter table public.contacts add column if not exists merged_by uuid references auth.users(id);

alter table public.leads add column if not exists contact_id uuid references public.contacts(id) on delete set null;
alter table public.leads add column if not exists contact_phone_normalized text;
alter table public.leads add column if not exists contact_email_normalized text;
alter table public.leads add column if not exists portal_client_id text;
alter table public.leads add column if not exists identity_match_status text not null default 'unmatched';
alter table public.leads add column if not exists identity_match_method text;
alter table public.leads add column if not exists identity_match_score smallint;
alter table public.leads add column if not exists identity_matched_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'contacts_merge_status_check'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts add constraint contacts_merge_status_check
      check (merge_status in ('active', 'merged')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_identity_match_status_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads add constraint leads_identity_match_status_check
      check (identity_match_status in ('matched', 'created', 'ambiguous', 'unmatched', 'no_identity')) not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_identity_match_score_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads add constraint leads_identity_match_score_check
      check (identity_match_score is null or identity_match_score between 0 and 100) not valid;
  end if;
end $$;

create table if not exists public.client_identifiers (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  identifier_type text not null check (identifier_type in ('phone', 'email', 'portal')),
  normalized_value text not null,
  portal text,
  is_active boolean not null default true,
  origin_contact_id uuid references public.contacts(id),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(contact_id, identifier_type, normalized_value)
);

create table if not exists public.client_contact_agents (
  agency_id uuid not null references public.agencies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  agent_id uuid not null references auth.users(id),
  relationship_reason text not null default 'assigned',
  origin_contact_id uuid references public.contacts(id),
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key(contact_id, agent_id)
);

create table if not exists public.client_contact_sources (
  agency_id uuid not null references public.agencies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete cascade,
  source_code text not null references public.lead_sources(code),
  origin_contact_id uuid references public.contacts(id),
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  primary key(contact_id, source_code)
);

create table if not exists public.client_merge_candidates (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  primary_contact_id uuid not null references public.contacts(id),
  duplicate_contact_id uuid not null references public.contacts(id),
  confidence smallint not null check (confidence between 0 and 100),
  reasons jsonb not null default '[]'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'merged', 'rejected', 'reverted')),
  detected_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  decision_note text,
  check (primary_contact_id < duplicate_contact_id),
  unique(agency_id, primary_contact_id, duplicate_contact_id)
);

create table if not exists public.client_merge_operations (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  primary_contact_id uuid not null references public.contacts(id),
  merged_contact_id uuid not null references public.contacts(id),
  performed_by uuid not null references auth.users(id),
  reason text not null,
  snapshot jsonb not null,
  status text not null default 'merged' check (status in ('merged', 'reverted')),
  merged_at timestamptz not null default now(),
  reverted_at timestamptz,
  reverted_by uuid references auth.users(id),
  revert_reason text
);

create table if not exists public.client_reconciliation_runs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete cascade,
  mode text not null check (mode in ('migration', 'dry_run', 'apply')),
  contacts_scanned integer not null default 0,
  leads_scanned integer not null default 0,
  leads_linked integer not null default 0,
  contacts_created integer not null default 0,
  ambiguous_leads integer not null default 0,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists public.client_reconciliation_links (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.client_reconciliation_runs(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  lead_id uuid not null references public.leads(id),
  previous_contact_id uuid references public.contacts(id),
  resolved_contact_id uuid references public.contacts(id),
  resolution text not null,
  score smallint,
  created_contact boolean not null default false,
  created_at timestamptz not null default now(),
  unique(run_id, lead_id)
);

create index if not exists contacts_identity_phone_idx
  on public.contacts(agency_id, normalized_phone) where normalized_phone is not null and merge_status = 'active' and deleted_at is null;
create index if not exists contacts_identity_email_idx
  on public.contacts(agency_id, normalized_email) where normalized_email is not null and merge_status = 'active' and deleted_at is null;
create index if not exists client_identifiers_lookup_idx
  on public.client_identifiers(agency_id, identifier_type, normalized_value) where is_active;
create index if not exists client_agents_agent_idx
  on public.client_contact_agents(agency_id, agent_id, contact_id) where active;
create index if not exists client_merge_candidates_queue_idx
  on public.client_merge_candidates(agency_id, status, confidence desc, detected_at desc);
create index if not exists leads_contact_timeline_idx
  on public.leads(agency_id, contact_id, received_at desc) where deleted_at is null;
create index if not exists demands_contact_timeline_idx
  on public.demands(agency_id, contact_id, created_at desc) where deleted_at is null;

create or replace function public.crm_prepare_contact_identity()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.normalized_phone := public.crm_normalize_client_phone(new.phone);
  new.normalized_phone_secondary := public.crm_normalize_client_phone(coalesce(new.phone_secondary, new.phone2));
  new.normalized_email := public.crm_normalize_client_email(new.email);
  return new;
end;
$$;

drop trigger if exists crm_prepare_contact_identity_trigger on public.contacts;
create trigger crm_prepare_contact_identity_trigger
before insert or update of phone, phone_secondary, phone2, email on public.contacts
for each row execute function public.crm_prepare_contact_identity();

create or replace function public.crm_sync_contact_identifiers()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  duplicate_ids uuid[];
begin
  update public.client_identifiers
  set is_active = false, last_seen_at = now()
  where contact_id = new.id and identifier_type in ('phone', 'email');

  if new.normalized_phone is not null then
    insert into public.client_identifiers(agency_id, contact_id, identifier_type, normalized_value, origin_contact_id)
    values (new.agency_id, new.id, 'phone', new.normalized_phone, new.id)
    on conflict(contact_id, identifier_type, normalized_value) do update
      set is_active = true, last_seen_at = now();
  end if;
  if new.normalized_phone_secondary is not null then
    insert into public.client_identifiers(agency_id, contact_id, identifier_type, normalized_value, origin_contact_id)
    values (new.agency_id, new.id, 'phone', new.normalized_phone_secondary, new.id)
    on conflict(contact_id, identifier_type, normalized_value) do update
      set is_active = true, last_seen_at = now();
  end if;
  if new.normalized_email is not null then
    insert into public.client_identifiers(agency_id, contact_id, identifier_type, normalized_value, origin_contact_id)
    values (new.agency_id, new.id, 'email', new.normalized_email, new.id)
    on conflict(contact_id, identifier_type, normalized_value) do update
      set is_active = true, last_seen_at = now();
  end if;

  if new.normalized_phone is not null then
    select array_agg(id order by id) into duplicate_ids from public.contacts
    where agency_id = new.agency_id and deleted_at is null and merge_status = 'active'
      and (normalized_phone = new.normalized_phone or normalized_phone_secondary = new.normalized_phone);
    perform public.crm_record_merge_candidates(new.agency_id, duplicate_ids, 'same_phone', 95);
  end if;
  if new.normalized_email is not null then
    select array_agg(id order by id) into duplicate_ids from public.contacts
    where agency_id = new.agency_id and deleted_at is null and merge_status = 'active'
      and normalized_email = new.normalized_email;
    perform public.crm_record_merge_candidates(new.agency_id, duplicate_ids, 'same_email', 90);
  end if;
  return new;
end;
$$;

drop trigger if exists crm_sync_contact_identifiers_trigger on public.contacts;
create trigger crm_sync_contact_identifiers_trigger
after insert or update of phone, phone_secondary, phone2, email on public.contacts
for each row execute function public.crm_sync_contact_identifiers();

create or replace function public.crm_record_merge_candidates(
  p_agency_id uuid,
  p_contact_ids uuid[],
  p_reason text,
  p_confidence integer
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  left_id uuid;
  right_id uuid;
begin
  if coalesce(array_length(p_contact_ids, 1), 0) < 2 then return; end if;
  foreach left_id in array p_contact_ids loop
    foreach right_id in array p_contact_ids loop
      if left_id < right_id then
        insert into public.client_merge_candidates(
          agency_id, primary_contact_id, duplicate_contact_id, confidence, reasons
        ) values (
          p_agency_id, left_id, right_id, p_confidence, jsonb_build_array(p_reason)
        )
        on conflict(agency_id, primary_contact_id, duplicate_contact_id) do update
          set confidence = greatest(client_merge_candidates.confidence, excluded.confidence),
              reasons = case
                when client_merge_candidates.reasons ? p_reason then client_merge_candidates.reasons
                else client_merge_candidates.reasons || to_jsonb(p_reason)
              end,
              detected_at = now()
        where client_merge_candidates.status in ('pending', 'reverted');
      end if;
    end loop;
  end loop;
end;
$$;

create or replace function public.resolve_crm_contact(
  p_agency_id uuid,
  p_actor_id uuid,
  p_name text,
  p_phone text,
  p_email text,
  p_agent_id uuid default null,
  p_source text default null,
  p_portal text default null,
  p_portal_client_id text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  phone_key text := public.crm_normalize_client_phone(p_phone);
  email_key text := public.crm_normalize_client_email(p_email);
  portal_key text := nullif(lower(trim(p_portal)), '');
  portal_client_key text := nullif(lower(trim(p_portal_client_id)), '');
  candidates uuid[];
  resolved_contact_id uuid;
  resolution text;
begin
  if p_agency_id is null then raise exception 'agency_required'; end if;
  if p_actor_id is not null and not exists (
    select 1 from public.profiles
    where user_id = p_actor_id and agency_id = p_agency_id and coalesce(status, 'active') = 'active'
  ) then raise exception 'actor_not_in_agency'; end if;
  if p_agent_id is not null and not exists (
    select 1 from public.profiles
    where user_id = p_agent_id and agency_id = p_agency_id and coalesce(status, 'active') = 'active'
  ) then raise exception 'agent_not_in_agency'; end if;

  select array_agg(distinct c.id order by c.id) into candidates
  from public.contacts c
  where c.agency_id = p_agency_id
    and c.deleted_at is null
    and c.merge_status = 'active'
    and (
      (phone_key is not null and (c.normalized_phone = phone_key or c.normalized_phone_secondary = phone_key))
      or (email_key is not null and c.normalized_email = email_key)
      or (
        portal_key is not null and portal_client_key is not null and exists (
          select 1 from public.client_identifiers i
          where i.contact_id = c.id and i.agency_id = p_agency_id and i.is_active
            and i.identifier_type = 'portal' and i.portal = portal_key
            and i.normalized_value = portal_key || ':' || portal_client_key
        )
      )
    );

  if coalesce(array_length(candidates, 1), 0) > 1 then
    perform public.crm_record_merge_candidates(
      p_agency_id, candidates,
      case when phone_key is not null then 'same_phone' else 'same_email' end,
      case when phone_key is not null then 95 else 90 end
    );
    return jsonb_build_object('contact_id', null, 'status', 'ambiguous', 'score', null);
  end if;

  if coalesce(array_length(candidates, 1), 0) = 1 then
    resolved_contact_id := candidates[1];
    resolution := 'matched';
    update public.contacts
    set full_name = case when nullif(trim(full_name), '') is null then coalesce(nullif(trim(p_name), ''), 'Client') else full_name end,
        phone = case when normalized_phone is null and phone_key is not null then nullif(trim(p_phone), '') else phone end,
        email = case when normalized_email is null and email_key is not null then nullif(trim(p_email), '') else email end,
        source = coalesce(source, nullif(trim(p_source), '')),
        updated_at = now()
    where id = resolved_contact_id and agency_id = p_agency_id;
  else
    insert into public.contacts(
      agency_id, agent_id, created_by, full_name, phone, email, type, source
    ) values (
      p_agency_id, p_agent_id, p_actor_id, coalesce(nullif(trim(p_name), ''), 'Client'),
      nullif(trim(p_phone), ''), nullif(trim(p_email), ''), array['cumparator']::text[],
      nullif(trim(p_source), '')
    ) returning id into resolved_contact_id;
    resolution := 'created';
  end if;

  if p_agent_id is not null then
    insert into public.client_contact_agents(
      agency_id, contact_id, agent_id, relationship_reason, origin_contact_id
    ) values (p_agency_id, resolved_contact_id, p_agent_id, 'lead_assignment', resolved_contact_id)
    on conflict(contact_id, agent_id) do update
      set active = true, last_seen_at = now();
  end if;

  if p_source is not null and exists (select 1 from public.lead_sources where code = p_source) then
    insert into public.client_contact_sources(agency_id, contact_id, source_code, origin_contact_id)
    values (p_agency_id, resolved_contact_id, p_source, resolved_contact_id)
    on conflict(contact_id, source_code) do update set last_seen_at = now();
  end if;

  if portal_key is not null and portal_client_key is not null then
    insert into public.client_identifiers(
      agency_id, contact_id, identifier_type, normalized_value, portal, origin_contact_id
    ) values (
      p_agency_id, resolved_contact_id, 'portal', portal_key || ':' || portal_client_key, portal_key, resolved_contact_id
    )
    on conflict(contact_id, identifier_type, normalized_value) do update
      set is_active = true, last_seen_at = now();
  end if;

  return jsonb_build_object(
    'contact_id', resolved_contact_id,
    'status', resolution,
    'score', case when resolution = 'created' then 100 when phone_key is not null then 95 else 90 end
  );
end;
$$;

create or replace function public.crm_prepare_lead_identity()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  result jsonb;
  resolved_id uuid;
begin
  new.contact_phone_normalized := public.crm_normalize_client_phone(new.contact_phone);
  new.contact_email_normalized := public.crm_normalize_client_email(new.contact_email);

  if new.contact_id is not null then
    if not exists (
      select 1 from public.contacts
      where id = new.contact_id and agency_id = new.agency_id
        and deleted_at is null and merge_status = 'active'
    ) then raise exception 'contact_not_in_agency'; end if;
    new.identity_match_status := 'matched';
    new.identity_match_method := coalesce(new.identity_match_method, 'explicit_contact_id');
    new.identity_match_score := coalesce(new.identity_match_score, 100);
    new.identity_matched_at := coalesce(new.identity_matched_at, now());
    return new;
  end if;

  if new.contact_phone_normalized is null and new.contact_email_normalized is null
     and nullif(trim(new.portal_client_id), '') is null then
    new.identity_match_status := 'no_identity';
    return new;
  end if;

  result := public.resolve_crm_contact(
    new.agency_id,
    coalesce(new.agent_id, new.assigned_to),
    new.contact_name,
    new.contact_phone,
    new.contact_email,
    coalesce(new.agent_id, new.assigned_to),
    new.source_normalized,
    case when new.portal_id is not null then new.portal_id::text else null end,
    new.portal_client_id
  );
  resolved_id := nullif(result ->> 'contact_id', '')::uuid;
  new.contact_id := resolved_id;
  new.identity_match_status := coalesce(result ->> 'status', 'unmatched');
  new.identity_match_method := case
    when new.contact_phone_normalized is not null then 'phone_exact'
    when new.contact_email_normalized is not null then 'email_exact'
    else 'portal_exact'
  end;
  new.identity_match_score := nullif(result ->> 'score', '')::smallint;
  new.identity_matched_at := case when resolved_id is not null then now() else null end;
  return new;
end;
$$;

drop trigger if exists crm_prepare_lead_identity_trigger on public.leads;
create trigger crm_prepare_lead_identity_trigger
before insert or update of contact_id, contact_name, contact_phone, contact_email, portal_client_id on public.leads
for each row execute function public.crm_prepare_lead_identity();

create or replace function public.crm_sync_lead_client_links()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.contact_id is null then return new; end if;

  if coalesce(new.agent_id, new.assigned_to) is not null then
    insert into public.client_contact_agents(
      agency_id, contact_id, agent_id, relationship_reason, origin_contact_id
    ) values (
      new.agency_id, new.contact_id, coalesce(new.agent_id, new.assigned_to), 'lead_assignment', new.contact_id
    ) on conflict(contact_id, agent_id) do update set active = true, last_seen_at = now();
  end if;

  if new.source_normalized is not null and exists (
    select 1 from public.lead_sources where code = new.source_normalized
  ) then
    insert into public.client_contact_sources(agency_id, contact_id, source_code, origin_contact_id)
    values (new.agency_id, new.contact_id, new.source_normalized, new.contact_id)
    on conflict(contact_id, source_code) do update set last_seen_at = now();
  end if;

  if tg_op = 'UPDATE' then
    update public.activities set contact_id = new.contact_id
    where agency_id = new.agency_id and lead_id = new.id
      and (contact_id is null or contact_id = old.contact_id);
    update public.calendar_events set contact_id = new.contact_id
    where agency_id = new.agency_id and lead_id = new.id
      and (contact_id is null or contact_id = old.contact_id);
  else
    update public.activities set contact_id = new.contact_id
    where agency_id = new.agency_id and lead_id = new.id and contact_id is null;
    update public.calendar_events set contact_id = new.contact_id
    where agency_id = new.agency_id and lead_id = new.id and contact_id is null;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_sync_lead_client_links_trigger on public.leads;
create trigger crm_sync_lead_client_links_trigger
after insert or update of contact_id, agent_id, assigned_to, source_normalized on public.leads
for each row execute function public.crm_sync_lead_client_links();

create or replace function public.crm_fill_activity_contact()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.contact_id is null and new.lead_id is not null then
    select contact_id into new.contact_id from public.leads
    where id = new.lead_id and agency_id = new.agency_id;
  end if;
  return new;
end;
$$;

drop trigger if exists crm_fill_activity_contact_trigger on public.activities;
create trigger crm_fill_activity_contact_trigger
before insert or update of lead_id on public.activities
for each row execute function public.crm_fill_activity_contact();

create or replace function public.crm_sync_contact_agent_link()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.contact_id is not null and not exists (
    select 1 from public.contacts
    where id = new.contact_id and agency_id = new.agency_id
      and deleted_at is null and merge_status = 'active'
  ) then raise exception 'contact_not_in_agency'; end if;
  if new.contact_id is not null and new.agent_id is not null then
    insert into public.client_contact_agents(
      agency_id, contact_id, agent_id, relationship_reason, origin_contact_id
    ) values (new.agency_id, new.contact_id, new.agent_id, tg_table_name, new.contact_id)
    on conflict(contact_id, agent_id) do update set active = true, last_seen_at = now();
  end if;
  return new;
end;
$$;

drop trigger if exists crm_sync_demand_contact_agent_trigger on public.demands;
create trigger crm_sync_demand_contact_agent_trigger
after insert or update of contact_id, agent_id on public.demands
for each row execute function public.crm_sync_contact_agent_link();
drop trigger if exists crm_sync_viewing_contact_agent_trigger on public.calendar_events;
create trigger crm_sync_viewing_contact_agent_trigger
after insert or update of contact_id, agent_id on public.calendar_events
for each row execute function public.crm_sync_contact_agent_link();
drop trigger if exists crm_sync_transaction_contact_agent_trigger on public.transactions;
create trigger crm_sync_transaction_contact_agent_trigger
after insert or update of contact_id, agent_id on public.transactions
for each row execute function public.crm_sync_contact_agent_link();

-- Reconcile existing rows. Exact phone/e-mail/portal matches are automatic;
-- multiple candidates remain unlinked and visible in client_merge_candidates.
do $$
declare
  agency_row record;
  lead_row record;
  result jsonb;
  resolved_id uuid;
  run_id uuid;
  linked_count integer;
  created_count integer;
  ambiguous_count integer;
begin
  -- Assign the source fields to themselves so both normalization triggers run
  -- and the identifier registry is populated on an idempotent re-application.
  update public.contacts
  set phone = phone, phone_secondary = phone_secondary, phone2 = phone2, email = email;

  update public.leads l
  set contact_id = d.contact_id,
      identity_match_status = 'matched', identity_match_method = 'converted_demand',
      identity_match_score = 100, identity_matched_at = now()
  from public.demands d
  where l.contact_id is null and l.converted_demand_id = d.id
    and l.agency_id = d.agency_id and d.contact_id is not null;

  update public.leads
  set contact_id = converted_contact_id,
      identity_match_status = 'matched', identity_match_method = 'converted_contact',
      identity_match_score = 100, identity_matched_at = now()
  where contact_id is null and converted_contact_id is not null;

  for agency_row in select distinct agency_id from public.leads where agency_id is not null loop
    linked_count := 0; created_count := 0; ambiguous_count := 0;
    insert into public.client_reconciliation_runs(agency_id, mode, contacts_scanned, leads_scanned)
    values (
      agency_row.agency_id, 'migration',
      (select count(*) from public.contacts where agency_id = agency_row.agency_id),
      (select count(*) from public.leads where agency_id = agency_row.agency_id)
    ) returning id into run_id;

    for lead_row in
      select * from public.leads
      where agency_id = agency_row.agency_id and contact_id is null and deleted_at is null
      order by received_at, id
    loop
      result := public.resolve_crm_contact(
        lead_row.agency_id,
        coalesce(lead_row.agent_id, lead_row.assigned_to),
        lead_row.contact_name,
        lead_row.contact_phone,
        lead_row.contact_email,
        coalesce(lead_row.agent_id, lead_row.assigned_to),
        lead_row.source_normalized,
        case when lead_row.portal_id is not null then lead_row.portal_id::text else null end,
        lead_row.portal_client_id
      );
      resolved_id := nullif(result ->> 'contact_id', '')::uuid;
      update public.leads
      set contact_id = resolved_id,
          contact_phone_normalized = public.crm_normalize_client_phone(contact_phone),
          contact_email_normalized = public.crm_normalize_client_email(contact_email),
          identity_match_status = coalesce(result ->> 'status', 'unmatched'),
          identity_match_method = case
            when public.crm_normalize_client_phone(contact_phone) is not null then 'phone_exact'
            when public.crm_normalize_client_email(contact_email) is not null then 'email_exact'
            else 'portal_exact'
          end,
          identity_match_score = nullif(result ->> 'score', '')::smallint,
          identity_matched_at = case when resolved_id is not null then now() else null end
      where id = lead_row.id;

      insert into public.client_reconciliation_links(
        run_id, agency_id, lead_id, previous_contact_id, resolved_contact_id,
        resolution, score, created_contact
      ) values (
        run_id, lead_row.agency_id, lead_row.id, null, resolved_id,
        coalesce(result ->> 'status', 'unmatched'), nullif(result ->> 'score', '')::smallint,
        result ->> 'status' = 'created'
      );
      if resolved_id is not null then linked_count := linked_count + 1; end if;
      if result ->> 'status' = 'created' then created_count := created_count + 1; end if;
      if result ->> 'status' = 'ambiguous' then ambiguous_count := ambiguous_count + 1; end if;
    end loop;

    update public.client_reconciliation_runs
    set leads_linked = linked_count, contacts_created = created_count,
        ambiguous_leads = ambiguous_count, completed_at = now()
    where id = run_id;
  end loop;

  update public.demands d set contact_id = l.contact_id
  from public.leads l
  where d.contact_id is null and l.converted_demand_id = d.id
    and l.agency_id = d.agency_id and l.contact_id is not null;

  update public.activities a set contact_id = l.contact_id
  from public.leads l
  where a.contact_id is null and a.lead_id = l.id and a.agency_id = l.agency_id;
  update public.calendar_events e set contact_id = l.contact_id
  from public.leads l
  where e.contact_id is null and e.lead_id = l.id and e.agency_id = l.agency_id;

  insert into public.client_contact_agents(
    agency_id, contact_id, agent_id, relationship_reason, origin_contact_id
  )
  select agency_id, id, coalesce(agent_id, created_by), 'contact_owner', id
  from public.contacts
  where coalesce(agent_id, created_by) is not null and deleted_at is null
  on conflict(contact_id, agent_id) do update set active = true, last_seen_at = now();

  insert into public.client_contact_agents(
    agency_id, contact_id, agent_id, relationship_reason, origin_contact_id
  )
  select agency_id, contact_id, agent_id, 'demand', contact_id
  from public.demands
  where contact_id is not null and agent_id is not null and deleted_at is null
  on conflict(contact_id, agent_id) do update set active = true, last_seen_at = now();

  insert into public.client_contact_agents(
    agency_id, contact_id, agent_id, relationship_reason, origin_contact_id
  )
  select agency_id, contact_id, agent_id, 'viewing', contact_id
  from public.calendar_events
  where contact_id is not null and agent_id is not null and deleted_at is null
  on conflict(contact_id, agent_id) do update set active = true, last_seen_at = now();

  insert into public.client_contact_agents(
    agency_id, contact_id, agent_id, relationship_reason, origin_contact_id
  )
  select agency_id, contact_id, agent_id, 'transaction', contact_id
  from public.transactions
  where contact_id is not null and agent_id is not null and deleted_at is null
  on conflict(contact_id, agent_id) do update set active = true, last_seen_at = now();

  insert into public.client_contact_agents(
    agency_id, contact_id, agent_id, relationship_reason, origin_contact_id
  )
  select agency_id, owner_contact_id, agent_id, 'owned_property', owner_contact_id
  from public.properties
  where owner_contact_id is not null and agent_id is not null and deleted_at is null
  on conflict(contact_id, agent_id) do update set active = true, last_seen_at = now();
end $$;

-- Detect duplicate contacts by exact active identifiers. This only creates
-- proposals; it never merges contacts automatically.
with duplicate_pairs as (
  select i1.agency_id, least(i1.contact_id, i2.contact_id) primary_id,
         greatest(i1.contact_id, i2.contact_id) duplicate_id,
         max(case when i1.identifier_type = 'phone' then 95 else 90 end) confidence,
         jsonb_agg(distinct case when i1.identifier_type = 'phone' then 'same_phone' else 'same_email' end) reasons
  from public.client_identifiers i1
  join public.client_identifiers i2
    on i2.agency_id = i1.agency_id and i2.identifier_type = i1.identifier_type
   and i2.normalized_value = i1.normalized_value and i2.contact_id <> i1.contact_id
   and i2.is_active
  where i1.is_active and i1.identifier_type in ('phone', 'email')
  group by i1.agency_id, least(i1.contact_id, i2.contact_id), greatest(i1.contact_id, i2.contact_id)
)
insert into public.client_merge_candidates(
  agency_id, primary_contact_id, duplicate_contact_id, confidence, reasons
)
select agency_id, primary_id, duplicate_id, confidence, reasons from duplicate_pairs
on conflict(agency_id, primary_contact_id, duplicate_contact_id) do update
set confidence = greatest(client_merge_candidates.confidence, excluded.confidence),
    reasons = excluded.reasons,
    detected_at = now()
where client_merge_candidates.status in ('pending', 'reverted');

alter table public.contacts validate constraint contacts_merge_status_check;
alter table public.leads validate constraint leads_identity_match_status_check;
alter table public.leads validate constraint leads_identity_match_score_check;

create or replace function public.merge_crm_contacts(
  p_agency_id uuid,
  p_primary_contact_id uuid,
  p_duplicate_contact_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  primary_row public.contacts%rowtype;
  duplicate_row public.contacts%rowtype;
  operation_id uuid;
  snapshot jsonb;
begin
  if p_primary_contact_id = p_duplicate_contact_id then raise exception 'contacts_must_differ'; end if;
  if nullif(trim(p_reason), '') is null then raise exception 'merge_reason_required'; end if;
  if not exists (
    select 1 from public.profiles
    where user_id = p_actor_id and agency_id = p_agency_id and coalesce(status, 'active') = 'active'
  ) then raise exception 'actor_not_in_agency'; end if;

  select * into primary_row from public.contacts
  where id = p_primary_contact_id and agency_id = p_agency_id
    and deleted_at is null and merge_status = 'active' for update;
  if not found then raise exception 'primary_contact_not_found'; end if;
  select * into duplicate_row from public.contacts
  where id = p_duplicate_contact_id and agency_id = p_agency_id
    and deleted_at is null and merge_status = 'active' for update;
  if not found then raise exception 'duplicate_contact_not_found'; end if;

  snapshot := jsonb_build_object(
    'primary_contact', to_jsonb(primary_row),
    'duplicate_contact', to_jsonb(duplicate_row),
    'leads_contact', coalesce((select jsonb_agg(id) from public.leads where agency_id = p_agency_id and contact_id = p_duplicate_contact_id), '[]'::jsonb),
    'leads_converted', coalesce((select jsonb_agg(id) from public.leads where agency_id = p_agency_id and converted_contact_id = p_duplicate_contact_id), '[]'::jsonb),
    'demands', coalesce((select jsonb_agg(id) from public.demands where agency_id = p_agency_id and contact_id = p_duplicate_contact_id), '[]'::jsonb),
    'activities', coalesce((select jsonb_agg(id) from public.activities where agency_id = p_agency_id and contact_id = p_duplicate_contact_id), '[]'::jsonb),
    'viewings', coalesce((select jsonb_agg(id) from public.calendar_events where agency_id = p_agency_id and contact_id = p_duplicate_contact_id), '[]'::jsonb),
    'transactions', coalesce((select jsonb_agg(id) from public.transactions where agency_id = p_agency_id and contact_id = p_duplicate_contact_id), '[]'::jsonb),
    'owned_properties', coalesce((select jsonb_agg(id) from public.properties where agency_id = p_agency_id and owner_contact_id = p_duplicate_contact_id), '[]'::jsonb)
  );

  insert into public.client_merge_operations(
    agency_id, primary_contact_id, merged_contact_id, performed_by, reason, snapshot
  ) values (
    p_agency_id, p_primary_contact_id, p_duplicate_contact_id, p_actor_id, trim(p_reason), snapshot
  ) returning id into operation_id;

  update public.leads set contact_id = p_primary_contact_id
    where agency_id = p_agency_id and contact_id = p_duplicate_contact_id;
  update public.leads set converted_contact_id = p_primary_contact_id
    where agency_id = p_agency_id and converted_contact_id = p_duplicate_contact_id;
  update public.demands set contact_id = p_primary_contact_id
    where agency_id = p_agency_id and contact_id = p_duplicate_contact_id;
  update public.activities set contact_id = p_primary_contact_id
    where agency_id = p_agency_id and contact_id = p_duplicate_contact_id;
  update public.calendar_events set contact_id = p_primary_contact_id
    where agency_id = p_agency_id and contact_id = p_duplicate_contact_id;
  update public.transactions set contact_id = p_primary_contact_id
    where agency_id = p_agency_id and contact_id = p_duplicate_contact_id;
  update public.properties set owner_contact_id = p_primary_contact_id
    where agency_id = p_agency_id and owner_contact_id = p_duplicate_contact_id;

  insert into public.client_identifiers(
    agency_id, contact_id, identifier_type, normalized_value, portal, is_active, origin_contact_id, first_seen_at, last_seen_at
  ) select agency_id, p_primary_contact_id, identifier_type, normalized_value, portal, true,
           p_duplicate_contact_id, first_seen_at, now()
    from public.client_identifiers where contact_id = p_duplicate_contact_id
  on conflict(contact_id, identifier_type, normalized_value) do update set
    is_active = true, last_seen_at = now();
  update public.client_identifiers set is_active = false
    where contact_id = p_duplicate_contact_id;

  insert into public.client_contact_agents(
    agency_id, contact_id, agent_id, relationship_reason, origin_contact_id, active, first_seen_at, last_seen_at
  ) select agency_id, p_primary_contact_id, agent_id, relationship_reason,
           p_duplicate_contact_id, true, first_seen_at, now()
    from public.client_contact_agents where contact_id = p_duplicate_contact_id and active
  on conflict(contact_id, agent_id) do update set active = true, last_seen_at = now();

  insert into public.client_contact_sources(
    agency_id, contact_id, source_code, origin_contact_id, first_seen_at, last_seen_at
  ) select agency_id, p_primary_contact_id, source_code, p_duplicate_contact_id, first_seen_at, now()
    from public.client_contact_sources where contact_id = p_duplicate_contact_id
  on conflict(contact_id, source_code) do update set last_seen_at = now();

  update public.contacts
  set full_name = coalesce(nullif(trim(primary_row.full_name), ''), duplicate_row.full_name),
      phone = coalesce(primary_row.phone, duplicate_row.phone),
      phone_secondary = coalesce(primary_row.phone_secondary, duplicate_row.phone, duplicate_row.phone_secondary),
      email = coalesce(primary_row.email, duplicate_row.email),
      notes = concat_ws(E'\n', nullif(trim(primary_row.notes), ''),
        case when nullif(trim(duplicate_row.notes), '') is not null then '[Profil unit] ' || trim(duplicate_row.notes) end),
      updated_at = now()
  where id = p_primary_contact_id;

  update public.contacts set merge_status = 'merged', merged_into_id = p_primary_contact_id,
    merged_at = now(), merged_by = p_actor_id, updated_at = now()
  where id = p_duplicate_contact_id;

  update public.client_merge_candidates set status = 'merged', decided_at = now(),
    decided_by = p_actor_id, decision_note = trim(p_reason)
  where agency_id = p_agency_id
    and primary_contact_id = least(p_primary_contact_id, p_duplicate_contact_id)
    and duplicate_contact_id = greatest(p_primary_contact_id, p_duplicate_contact_id);

  insert into public.activity_logs(
    agency_id, entity_type, entity_id, user_id, action, field, old_value, new_value
  ) values (
    p_agency_id, 'contact', p_primary_contact_id, p_actor_id, 'merge', 'merged_contact_id',
    p_duplicate_contact_id::text, operation_id::text
  );
  return operation_id;
end;
$$;

create or replace function public.revert_crm_contact_merge(
  p_agency_id uuid,
  p_operation_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  operation public.client_merge_operations%rowtype;
  item jsonb;
begin
  if nullif(trim(p_reason), '') is null then raise exception 'revert_reason_required'; end if;
  if not exists (
    select 1 from public.profiles
    where user_id = p_actor_id and agency_id = p_agency_id and coalesce(status, 'active') = 'active'
  ) then raise exception 'actor_not_in_agency'; end if;

  select * into operation from public.client_merge_operations
  where id = p_operation_id and agency_id = p_agency_id and status = 'merged' for update;
  if not found then raise exception 'merge_operation_not_found'; end if;

  -- Reactivate the secondary profile before restoring foreign keys because
  -- the lead identity trigger rejects links to profiles still marked merged.
  update public.contacts set merge_status = 'active', merged_into_id = null,
    merged_at = null, merged_by = null, updated_at = now()
  where id = operation.merged_contact_id and agency_id = p_agency_id;

  for item in select * from jsonb_array_elements(operation.snapshot -> 'leads_contact') loop
    update public.leads set contact_id = operation.merged_contact_id
    where id = trim(both '"' from item::text)::uuid and agency_id = p_agency_id
      and contact_id = operation.primary_contact_id;
  end loop;
  for item in select * from jsonb_array_elements(operation.snapshot -> 'leads_converted') loop
    update public.leads set converted_contact_id = operation.merged_contact_id
    where id = trim(both '"' from item::text)::uuid and agency_id = p_agency_id
      and converted_contact_id = operation.primary_contact_id;
  end loop;
  for item in select * from jsonb_array_elements(operation.snapshot -> 'demands') loop
    update public.demands set contact_id = operation.merged_contact_id
    where id = trim(both '"' from item::text)::uuid and agency_id = p_agency_id
      and contact_id = operation.primary_contact_id;
  end loop;
  for item in select * from jsonb_array_elements(operation.snapshot -> 'activities') loop
    update public.activities set contact_id = operation.merged_contact_id
    where id = trim(both '"' from item::text)::uuid and agency_id = p_agency_id
      and contact_id = operation.primary_contact_id;
  end loop;
  for item in select * from jsonb_array_elements(operation.snapshot -> 'viewings') loop
    update public.calendar_events set contact_id = operation.merged_contact_id
    where id = trim(both '"' from item::text)::uuid and agency_id = p_agency_id
      and contact_id = operation.primary_contact_id;
  end loop;
  for item in select * from jsonb_array_elements(operation.snapshot -> 'transactions') loop
    update public.transactions set contact_id = operation.merged_contact_id
    where id = trim(both '"' from item::text)::uuid and agency_id = p_agency_id
      and contact_id = operation.primary_contact_id;
  end loop;
  for item in select * from jsonb_array_elements(operation.snapshot -> 'owned_properties') loop
    update public.properties set owner_contact_id = operation.merged_contact_id
    where id = trim(both '"' from item::text)::uuid and agency_id = p_agency_id
      and owner_contact_id = operation.primary_contact_id;
  end loop;

  update public.client_identifiers set is_active = true
    where contact_id = operation.merged_contact_id;
  update public.client_identifiers set is_active = false
    where contact_id = operation.primary_contact_id and origin_contact_id = operation.merged_contact_id;
  update public.client_contact_agents set active = false
    where contact_id = operation.primary_contact_id and origin_contact_id = operation.merged_contact_id;

  update public.client_merge_operations set status = 'reverted', reverted_at = now(),
    reverted_by = p_actor_id, revert_reason = trim(p_reason)
  where id = p_operation_id;
  update public.client_merge_candidates set status = 'reverted', decided_at = now(),
    decided_by = p_actor_id, decision_note = trim(p_reason)
  where agency_id = p_agency_id
    and primary_contact_id = least(operation.primary_contact_id, operation.merged_contact_id)
    and duplicate_contact_id = greatest(operation.primary_contact_id, operation.merged_contact_id);

  insert into public.activity_logs(
    agency_id, entity_type, entity_id, user_id, action, field, old_value, new_value
  ) values (
    p_agency_id, 'contact', operation.primary_contact_id, p_actor_id, 'merge_reverted',
    'merge_operation_id', p_operation_id::text, trim(p_reason)
  );
  return true;
end;
$$;

revoke all on function public.resolve_crm_contact(uuid,uuid,text,text,text,uuid,text,text,text) from public, anon, authenticated;
revoke all on function public.merge_crm_contacts(uuid,uuid,uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.revert_crm_contact_merge(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.resolve_crm_contact(uuid,uuid,text,text,text,uuid,text,text,text) to service_role;
grant execute on function public.merge_crm_contacts(uuid,uuid,uuid,uuid,text) to service_role;
grant execute on function public.revert_crm_contact_merge(uuid,uuid,uuid,text) to service_role;

alter table public.client_identifiers enable row level security;
alter table public.client_contact_agents enable row level security;
alter table public.client_contact_sources enable row level security;
alter table public.client_merge_candidates enable row level security;
alter table public.client_merge_operations enable row level security;
alter table public.client_reconciliation_runs enable row level security;
alter table public.client_reconciliation_links enable row level security;
revoke all on public.client_identifiers, public.client_contact_agents, public.client_contact_sources,
  public.client_merge_candidates, public.client_merge_operations,
  public.client_reconciliation_runs, public.client_reconciliation_links from anon, authenticated;
grant select on public.client_identifiers, public.client_contact_agents, public.client_contact_sources,
  public.client_merge_candidates, public.client_merge_operations,
  public.client_reconciliation_runs, public.client_reconciliation_links to authenticated;

drop policy if exists crm_client_identifiers_read on public.client_identifiers;
create policy crm_client_identifiers_read on public.client_identifiers for select to authenticated using (
  agency_id = public.current_crm_agency_id() and public.crm_has_permission('contacts', 'view')
  and exists (
    select 1 from public.contacts c where c.id = contact_id and c.agency_id = public.current_crm_agency_id()
      and (public.crm_has_permission('contacts', 'manage_all') or c.agent_id = auth.uid() or c.created_by = auth.uid()
        or exists (select 1 from public.client_contact_agents ca where ca.contact_id = c.id and ca.agent_id = auth.uid() and ca.active))
  )
);
drop policy if exists crm_client_agents_read on public.client_contact_agents;
create policy crm_client_agents_read on public.client_contact_agents for select to authenticated using (
  agency_id = public.current_crm_agency_id() and public.crm_has_permission('contacts', 'view')
  and (agent_id = auth.uid() or public.crm_has_permission('contacts', 'manage_all'))
);
drop policy if exists crm_client_sources_read on public.client_contact_sources;
create policy crm_client_sources_read on public.client_contact_sources for select to authenticated using (
  agency_id = public.current_crm_agency_id() and public.crm_has_permission('contacts', 'view')
  and exists (
    select 1 from public.contacts c where c.id = contact_id and c.agency_id = public.current_crm_agency_id()
      and (public.crm_has_permission('contacts', 'manage_all') or c.agent_id = auth.uid() or c.created_by = auth.uid()
        or exists (select 1 from public.client_contact_agents ca where ca.contact_id = c.id and ca.agent_id = auth.uid() and ca.active))
  )
);

drop policy if exists crm_client_merge_candidates_read on public.client_merge_candidates;
create policy crm_client_merge_candidates_read on public.client_merge_candidates for select to authenticated using (
  agency_id = public.current_crm_agency_id() and public.crm_has_permission('contacts', 'manage_all')
);
drop policy if exists crm_client_merge_operations_read on public.client_merge_operations;
create policy crm_client_merge_operations_read on public.client_merge_operations for select to authenticated using (
  agency_id = public.current_crm_agency_id() and public.crm_has_permission('contacts', 'manage_all')
);
drop policy if exists crm_client_reconciliation_runs_read on public.client_reconciliation_runs;
create policy crm_client_reconciliation_runs_read on public.client_reconciliation_runs for select to authenticated using (
  agency_id = public.current_crm_agency_id() and public.crm_has_permission('contacts', 'manage_all')
);
drop policy if exists crm_client_reconciliation_links_read on public.client_reconciliation_links;
create policy crm_client_reconciliation_links_read on public.client_reconciliation_links for select to authenticated using (
  agency_id = public.current_crm_agency_id() and public.crm_has_permission('contacts', 'manage_all')
);

-- Replace the Phase 5 contact policies so agents can also see a canonical
-- client explicitly linked to one of their leads, demands or viewings.
drop policy if exists crm_contacts_select on public.contacts;
create policy crm_contacts_select on public.contacts for select to authenticated using (
  agency_id = public.current_crm_agency_id()
  and public.crm_has_permission('contacts', 'view')
  and (
    public.crm_has_permission('contacts', 'manage_all') or agent_id = auth.uid() or created_by = auth.uid()
    or exists (
      select 1 from public.client_contact_agents ca
      where ca.contact_id = contacts.id and ca.agency_id = contacts.agency_id
        and ca.agent_id = auth.uid() and ca.active
    )
  )
);
drop policy if exists crm_contacts_update on public.contacts;
create policy crm_contacts_update on public.contacts for update to authenticated using (
  agency_id = public.current_crm_agency_id()
  and public.crm_has_permission('contacts', 'edit')
  and (
    public.crm_has_permission('contacts', 'manage_all') or agent_id = auth.uid() or created_by = auth.uid()
    or exists (
      select 1 from public.client_contact_agents ca
      where ca.contact_id = contacts.id and ca.agent_id = auth.uid() and ca.active
    )
  )
) with check (
  agency_id = public.current_crm_agency_id() and public.crm_has_permission('contacts', 'edit')
);

comment on table public.client_merge_candidates is
  'Review queue only. Exact duplicate signals never merge contacts automatically.';
comment on table public.client_merge_operations is
  'Reversible merge journal. Snapshot identifies only rows moved by that operation.';

commit;
