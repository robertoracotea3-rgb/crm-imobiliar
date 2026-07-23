-- Phase 23: append-only, tamper-evident audit trail for sensitive CRM actions.
-- Apply on staging after backup. This migration is additive and idempotent.

begin;

create extension if not exists pgcrypto;

create table if not exists public.crm_audit_log (
  id uuid primary key default gen_random_uuid(),
  sequence_no bigint generated always as identity,
  agency_id uuid references public.agencies(id),
  actor_user_id uuid,
  actor_role text,
  action text not null,
  entity_type text not null,
  entity_id text,
  before_values jsonb,
  after_values jsonb,
  result text not null,
  reason text,
  route text,
  ip_hash text,
  user_agent text,
  request_id text,
  metadata jsonb not null default '{}'::jsonb,
  previous_hash text,
  event_hash text not null unique,
  occurred_at timestamptz not null,
  constraint crm_audit_sequence_unique unique(sequence_no),
  constraint crm_audit_action_format
    check (action ~ '^[a-z][a-z0-9_.-]{1,79}$'),
  constraint crm_audit_entity_format
    check (entity_type ~ '^[a-z][a-z0-9_.-]{0,79}$'),
  constraint crm_audit_result_values
    check (result in ('success', 'denied', 'failure')),
  constraint crm_audit_ip_hash_format
    check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  constraint crm_audit_event_hash_format
    check (event_hash ~ '^[0-9a-f]{64}$')
);

alter table public.crm_audit_log
  add column if not exists sequence_no bigint generated always as identity;
create unique index if not exists idx_crm_audit_sequence
  on public.crm_audit_log(sequence_no);
create index if not exists idx_crm_audit_agency_time
  on public.crm_audit_log(agency_id, occurred_at desc, id desc);
create index if not exists idx_crm_audit_actor_time
  on public.crm_audit_log(actor_user_id, occurred_at desc)
  where actor_user_id is not null;
create index if not exists idx_crm_audit_entity
  on public.crm_audit_log(agency_id, entity_type, entity_id, occurred_at desc);
create index if not exists idx_crm_audit_action
  on public.crm_audit_log(agency_id, action, occurred_at desc);

create or replace function public.crm_audit_redact(p_value jsonb)
returns jsonb
language plpgsql
immutable
set search_path = public, pg_temp
as $$
declare
  value_type text;
  result jsonb;
begin
  if p_value is null then return null; end if;
  value_type := jsonb_typeof(p_value);

  if value_type = 'object' then
    select coalesce(
      jsonb_object_agg(
        key,
        case
          when key ~* '(password|passwd|token|secret|authorization|cookie|api.?key|refresh.?token|access.?token)'
            then '"[REDACTED]"'::jsonb
          else public.crm_audit_redact(value)
        end
      ),
      '{}'::jsonb
    )
    into result
    from jsonb_each(p_value);
    return result;
  end if;

  if value_type = 'array' then
    select coalesce(jsonb_agg(public.crm_audit_redact(value)), '[]'::jsonb)
    into result
    from jsonb_array_elements(p_value);
    return result;
  end if;

  if value_type = 'string' then
    return to_jsonb(left(p_value #>> '{}', 2000));
  end if;

  return p_value;
end
$$;

create or replace function public.crm_append_audit_event(
  p_agency_id uuid,
  p_actor_user_id uuid,
  p_actor_role text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_before_values jsonb,
  p_after_values jsonb,
  p_result text,
  p_reason text,
  p_route text,
  p_ip_hash text,
  p_user_agent text,
  p_request_id text,
  p_metadata jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
set timezone = 'UTC'
as $$
declare
  audit_id uuid := gen_random_uuid();
  audit_time timestamptz := clock_timestamp();
  previous_event_hash text;
  clean_before jsonb := public.crm_audit_redact(p_before_values);
  clean_after jsonb := public.crm_audit_redact(p_after_values);
  clean_metadata jsonb := coalesce(public.crm_audit_redact(p_metadata), '{}'::jsonb);
  calculated_hash text;
begin
  if p_action is null or p_action !~ '^[a-z][a-z0-9_.-]{1,79}$' then
    raise exception 'audit_action_invalid';
  end if;
  if p_entity_type is null or p_entity_type !~ '^[a-z][a-z0-9_.-]{0,79}$' then
    raise exception 'audit_entity_type_invalid';
  end if;
  if p_result not in ('success', 'denied', 'failure') then
    raise exception 'audit_result_invalid';
  end if;
  if p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'audit_ip_hash_invalid';
  end if;
  if p_agency_id is not null and not exists (
    select 1 from public.agencies where id = p_agency_id
  ) then
    raise exception 'audit_agency_invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(coalesce(p_agency_id::text, 'global'), 0));
  select event_hash
  into previous_event_hash
  from public.crm_audit_log
  where agency_id is not distinct from p_agency_id
  order by sequence_no desc
  limit 1;

  calculated_hash := encode(digest(concat_ws('|',
    coalesce(previous_event_hash, ''),
    audit_id::text,
    coalesce(p_agency_id::text, ''),
    coalesce(p_actor_user_id::text, ''),
    coalesce(left(p_actor_role, 80), ''),
    p_action,
    p_entity_type,
    coalesce(left(p_entity_id, 200), ''),
    p_result,
    coalesce(left(p_reason, 1000), ''),
    coalesce(left(p_route, 500), ''),
    coalesce(p_ip_hash, ''),
    coalesce(left(p_user_agent, 500), ''),
    coalesce(left(p_request_id, 200), ''),
    audit_time::text,
    coalesce(clean_before::text, ''),
    coalesce(clean_after::text, ''),
    clean_metadata::text
  ), 'sha256'), 'hex');

  insert into public.crm_audit_log(
    id, agency_id, actor_user_id, actor_role, action, entity_type, entity_id,
    before_values, after_values, result, reason, route, ip_hash, user_agent,
    request_id, metadata, previous_hash, event_hash, occurred_at
  ) values (
    audit_id, p_agency_id, p_actor_user_id, left(p_actor_role, 80), p_action,
    p_entity_type, left(p_entity_id, 200), clean_before, clean_after, p_result,
    left(p_reason, 1000), left(p_route, 500), p_ip_hash, left(p_user_agent, 500),
    left(p_request_id, 200), clean_metadata, previous_event_hash, calculated_hash,
    audit_time
  );

  return audit_id;
end
$$;

create or replace function public.crm_verify_audit_chain(p_agency_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
set timezone = 'UTC'
as $$
declare
  event_row public.crm_audit_log%rowtype;
  expected_previous text := null;
  expected_hash text;
  checked_count integer := 0;
begin
  for event_row in
    select *
    from public.crm_audit_log
    where agency_id is not distinct from p_agency_id
    order by sequence_no
  loop
    expected_hash := encode(digest(concat_ws('|',
      coalesce(expected_previous, ''),
      event_row.id::text,
      coalesce(event_row.agency_id::text, ''),
      coalesce(event_row.actor_user_id::text, ''),
      coalesce(event_row.actor_role, ''),
      event_row.action,
      event_row.entity_type,
      coalesce(event_row.entity_id, ''),
      event_row.result,
      coalesce(event_row.reason, ''),
      coalesce(event_row.route, ''),
      coalesce(event_row.ip_hash, ''),
      coalesce(event_row.user_agent, ''),
      coalesce(event_row.request_id, ''),
      event_row.occurred_at::text,
      coalesce(event_row.before_values::text, ''),
      coalesce(event_row.after_values::text, ''),
      event_row.metadata::text
    ), 'sha256'), 'hex');

    if event_row.previous_hash is distinct from expected_previous
      or event_row.event_hash is distinct from expected_hash then
      return jsonb_build_object(
        'valid', false,
        'checked', checked_count,
        'first_invalid_id', event_row.id
      );
    end if;

    checked_count := checked_count + 1;
    expected_previous := event_row.event_hash;
  end loop;

  return jsonb_build_object(
    'valid', true,
    'checked', checked_count,
    'last_hash', expected_previous
  );
end
$$;

create or replace function public.crm_reject_audit_mutation()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  raise exception 'crm_audit_log_is_immutable' using errcode = '55000';
end
$$;

drop trigger if exists crm_audit_log_immutable on public.crm_audit_log;
create trigger crm_audit_log_immutable
before update or delete on public.crm_audit_log
for each row execute function public.crm_reject_audit_mutation();

alter table public.crm_audit_log enable row level security;
revoke all on public.crm_audit_log from public, anon, authenticated;
grant select on public.crm_audit_log to authenticated, service_role;

drop policy if exists crm_audit_log_read on public.crm_audit_log;
create policy crm_audit_log_read on public.crm_audit_log
  for select to authenticated
  using (
    agency_id = public.current_crm_agency_id()
    and public.crm_has_permission('team', 'manage_permissions')
  );

revoke all on function public.crm_audit_redact(jsonb) from public, anon, authenticated;
revoke all on function public.crm_append_audit_event(
  uuid, uuid, text, text, text, text, jsonb, jsonb, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
revoke all on function public.crm_verify_audit_chain(uuid) from public, anon, authenticated;
revoke all on function public.crm_reject_audit_mutation() from public, anon, authenticated;
grant execute on function public.crm_append_audit_event(
  uuid, uuid, text, text, text, text, jsonb, jsonb, text, text, text, text, text, text, jsonb
) to service_role;
grant execute on function public.crm_verify_audit_chain(uuid) to service_role;

comment on table public.crm_audit_log is
  'Append-only CRM audit trail. Values are redacted, request IPs are irreversible hashes, and every agency has a SHA-256 event chain.';

commit;
