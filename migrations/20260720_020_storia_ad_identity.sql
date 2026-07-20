-- Phase 2: deterministic Storia message -> advert -> property -> agent linkage.
-- Additive and idempotent. Apply to staging only after 20260720_010.

begin;

insert into public.portals(id, name, integration_type, is_active)
values ('storia_olx', 'Storia.ro / OLX.ro', 'api', true)
on conflict (id) do nothing;

alter table public.portal_listings
  add column if not exists portal_ad_id text;

alter table public.leads
  add column if not exists portal_listing_id uuid;
alter table public.leads
  add column if not exists portal_ad_id text;
alter table public.leads
  add column if not exists property_title text;
alter table public.leads
  add column if not exists source_normalized text;
alter table public.leads
  add column if not exists webhook_transaction_id text;
alter table public.leads
  add column if not exists portal_conversation_id text;
alter table public.leads
  add column if not exists association_status text;
alter table public.leads
  add column if not exists association_note text;
alter table public.leads
  add column if not exists association_resolved_at timestamptz;
alter table public.leads
  add column if not exists association_resolved_by uuid;

-- Recover the numeric advert id already returned by OLX and retained in raw_response.
update public.portal_listings
set portal_ad_id = coalesce(
  nullif(raw_response #>> '{data,id}', ''),
  nullif(raw_response ->> 'id', ''),
  nullif(raw_response #>> '{data,ad_id}', ''),
  nullif(raw_response ->> 'ad_id', '')
)
where portal = 'storia'
  and portal_ad_id is null
  and coalesce(
    nullif(raw_response #>> '{data,id}', ''),
    nullif(raw_response ->> 'id', ''),
    nullif(raw_response #>> '{data,ad_id}', ''),
    nullif(raw_response ->> 'ad_id', '')
  ) is not null;

-- Stop safely instead of silently selecting one property when imported data conflicts.
do $$
begin
  if exists (
    select 1
    from public.portal_listings
    where portal_ad_id is not null
    group by agency_id, portal, portal_ad_id
    having count(*) > 1
  ) then
    raise exception 'Ambiguous portal_ad_id values detected; run the dry-run backfill report first';
  end if;
end $$;

create unique index if not exists portal_listings_agency_portal_ad_uidx
  on public.portal_listings(agency_id, portal, portal_ad_id)
  where portal_ad_id is not null;
create index if not exists portal_listings_portal_ad_lookup_idx
  on public.portal_listings(portal, portal_ad_id)
  where portal_ad_id is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_portal_listing_id_fkey'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_portal_listing_id_fkey
      foreign key (portal_listing_id) references public.portal_listings(id)
      on delete set null not valid;
  end if;
end $$;

create unique index if not exists leads_agency_webhook_transaction_uidx
  on public.leads(agency_id, webhook_transaction_id)
  where webhook_transaction_id is not null and deleted_at is null;
create index if not exists leads_portal_listing_conversation_idx
  on public.leads(agency_id, portal_listing_id, portal_conversation_id)
  where portal_listing_id is not null and deleted_at is null;

update public.leads
set source_normalized = case
  when lower(coalesce(source, '')) like '%storia%' then 'storia'
  when lower(coalesce(source, '')) like '%olx%' then 'olx'
  when lower(coalesce(source, '')) like '%facebook%' then 'facebook'
  when lower(coalesce(source, '')) like '%site%' or lower(coalesce(source, '')) like '%website%' then 'website'
  when source is not null then lower(regexp_replace(trim(source), '[^a-zA-Z0-9]+', '_', 'g'))
  else null
end
where source_normalized is null;

update public.leads l
set property_title = p.title
from public.properties p
where l.property_id = p.id
  and l.agency_id = p.agency_id
  and l.property_title is null;

update public.leads
set association_status = case when property_id is null then 'pending' else 'linked' end
where association_status is null
  and source_normalized in ('storia', 'olx');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'leads_association_status_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads
      add constraint leads_association_status_check
      check (association_status is null or association_status in ('pending', 'linked', 'ignored'))
      not valid;
  end if;
end $$;

create index if not exists leads_unmatched_storia_idx
  on public.leads(agency_id, received_at desc)
  where property_id is null
    and association_status = 'pending'
    and source_normalized in ('storia', 'olx')
    and deleted_at is null;

create table if not exists public.portal_unmatched_messages (
  id uuid primary key default gen_random_uuid(),
  webhook_event_id uuid not null unique references public.webhook_events(id) on delete restrict,
  agency_id uuid references public.agencies(id) on delete restrict,
  portal_id text references public.portals(id) on delete restrict,
  portal text not null default 'storia',
  portal_ad_id text,
  external_id text,
  conversation_id text,
  sender_name text,
  sender_email text,
  sender_phone text,
  message text,
  property_title_hint text,
  advert_url_hint text,
  reason text not null,
  status text not null default 'pending'
    check (status in ('pending', 'linked', 'ignored')),
  linked_lead_id uuid references public.leads(id) on delete set null,
  linked_property_id uuid references public.properties(id) on delete set null,
  resolved_by uuid references auth.users(id) on delete set null,
  resolution_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  resolved_at timestamptz
);

create index if not exists portal_unmatched_messages_agency_status_idx
  on public.portal_unmatched_messages(agency_id, status, created_at desc);
create index if not exists portal_unmatched_messages_ad_idx
  on public.portal_unmatched_messages(portal, portal_ad_id)
  where portal_ad_id is not null;

create table if not exists public.portal_backfill_runs (
  id uuid primary key default gen_random_uuid(),
  operation text not null,
  dry_run boolean not null default true,
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed')),
  cursor_listing_id uuid,
  processed_count integer not null default 0,
  updated_count integer not null default 0,
  skipped_count integer not null default 0,
  ambiguous_count integer not null default 0,
  report jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz
);

alter table public.portal_unmatched_messages enable row level security;
alter table public.portal_backfill_runs enable row level security;
revoke all on table public.portal_unmatched_messages from public, anon, authenticated;
revoke all on table public.portal_backfill_runs from public, anon, authenticated;
grant select, insert, update, delete on table public.portal_unmatched_messages to service_role;
grant select, insert, update, delete on table public.portal_backfill_runs to service_role;

commit;
