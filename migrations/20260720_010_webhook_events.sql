-- Faza 1: ledger durabil pentru webhookuri OLX/Storia.
-- Migrare aditivă și idempotentă. Nu șterge și nu modifică date de business.

begin;

create table if not exists public.webhook_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id) on delete set null,
  portal text not null,
  transaction_id text,
  object_id text,
  flow text,
  event_type text,
  payload_hash text not null,
  payload jsonb,
  signature_verified boolean not null default false,
  processing_status text not null default 'received'
    check (processing_status in ('received', 'processing', 'processed', 'failed', 'rejected')),
  duplicate_count integer not null default 0 check (duplicate_count >= 0),
  security_flag boolean not null default false,
  error_code text,
  error_message text,
  received_at timestamptz not null default now(),
  last_received_at timestamptz not null default now(),
  processing_started_at timestamptz,
  processed_at timestamptz
);

create unique index if not exists uq_webhook_events_verified_transaction
  on public.webhook_events(portal, transaction_id)
  where signature_verified = true and transaction_id is not null;

create index if not exists idx_webhook_events_status_received
  on public.webhook_events(processing_status, received_at desc);

create index if not exists idx_webhook_events_agency_received
  on public.webhook_events(agency_id, received_at desc)
  where agency_id is not null;

alter table public.webhook_events enable row level security;
revoke all on table public.webhook_events from public, anon, authenticated;
grant select, insert, update on table public.webhook_events to service_role;

create or replace function public.reserve_webhook_event(
  p_portal text,
  p_transaction_id text,
  p_object_id text,
  p_flow text,
  p_event_type text,
  p_payload_hash text,
  p_payload jsonb
)
returns table (
  event_id uuid,
  is_duplicate boolean,
  payload_mismatch boolean,
  current_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  reserved public.webhook_events%rowtype;
  mismatch boolean;
begin
  if nullif(trim(p_portal), '') is null
     or nullif(trim(p_transaction_id), '') is null
     or nullif(trim(p_object_id), '') is null
     or nullif(trim(p_payload_hash), '') is null then
    raise exception 'Missing required verified webhook identifiers';
  end if;

  insert into public.webhook_events (
    portal,
    transaction_id,
    object_id,
    flow,
    event_type,
    payload_hash,
    payload,
    signature_verified,
    processing_status
  ) values (
    lower(trim(p_portal)),
    trim(p_transaction_id),
    trim(p_object_id),
    nullif(trim(p_flow), ''),
    nullif(trim(p_event_type), ''),
    lower(trim(p_payload_hash)),
    p_payload,
    true,
    'received'
  )
  on conflict (portal, transaction_id)
    where signature_verified = true and transaction_id is not null
  do nothing
  returning * into reserved;

  if reserved.id is not null then
    return query select reserved.id, false, false, reserved.processing_status;
    return;
  end if;

  select * into reserved
  from public.webhook_events
  where portal = lower(trim(p_portal))
    and transaction_id = trim(p_transaction_id)
    and signature_verified = true
  for update;

  if reserved.id is null then
    raise exception 'Verified webhook reservation conflict without existing row';
  end if;

  mismatch := reserved.payload_hash <> lower(trim(p_payload_hash));

  update public.webhook_events
  set duplicate_count = duplicate_count + 1,
      last_received_at = now(),
      security_flag = security_flag or mismatch,
      error_code = case when mismatch then 'duplicate_payload_mismatch' else error_code end,
      error_message = case
        when mismatch then 'Duplicate transaction received with a different payload hash'
        else error_message
      end
  where id = reserved.id;

  return query select reserved.id, true, mismatch, reserved.processing_status;
end;
$$;

revoke all on function public.reserve_webhook_event(text, text, text, text, text, text, jsonb)
  from public, anon, authenticated;
grant execute on function public.reserve_webhook_event(text, text, text, text, text, text, jsonb)
  to service_role;

commit;
