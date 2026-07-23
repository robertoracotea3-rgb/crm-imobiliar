-- Phase 25: persistent login throttling, application sessions and enforced MFA.
-- Apply only after backup, first on staging. Additive and idempotent.

begin;

create extension if not exists pgcrypto;

alter table if exists public.profiles
  add column if not exists role text not null default 'agent';
alter table if exists public.profiles
  add column if not exists permissions jsonb;
alter table if exists public.profiles
  add column if not exists force_password_change boolean not null default false;
alter table if exists public.profiles
  add column if not exists password_changed_at timestamptz;
alter table if exists public.profiles
  add column if not exists mfa_enrolled_at timestamptz;
alter table if exists public.profiles
  add column if not exists security_updated_at timestamptz not null default now();

-- The known audit account must choose a new password at its next login.
update public.profiles profile
set force_password_change = true,
    security_updated_at = now()
from auth.users account
where account.id = profile.user_id
  and (
    lower(coalesce(account.email, '')) = 'test@fortis.crm'
    or lower(coalesce(account.raw_user_meta_data ->> 'username', '')) = 'test'
  )
  and not profile.force_password_change;

create table if not exists public.crm_auth_policy (
  singleton boolean primary key default true check (singleton),
  account_attempts integer not null default 5 check (account_attempts between 3 and 20),
  ip_attempts integer not null default 30 check (ip_attempts between 10 and 200),
  registration_attempts integer not null default 10 check (registration_attempts between 3 and 100),
  attempt_window_seconds integer not null default 900 check (attempt_window_seconds between 60 and 86400),
  lock_seconds integer not null default 900 check (lock_seconds between 60 and 86400),
  session_max_minutes integer not null default 720 check (session_max_minutes between 30 and 10080),
  session_idle_minutes integer not null default 30 check (session_idle_minutes between 5 and 1440),
  updated_at timestamptz not null default now()
);

insert into public.crm_auth_policy(singleton)
values (true)
on conflict (singleton) do nothing;

create table if not exists public.crm_auth_rate_limits (
  scope text not null check (scope in ('login_account', 'login_ip', 'registration_ip')),
  key_hash text not null check (key_hash ~ '^[0-9a-f]{64}$'),
  failure_count integer not null default 0 check (failure_count >= 0),
  window_started_at timestamptz not null default now(),
  last_failure_at timestamptz,
  locked_until timestamptz,
  updated_at timestamptz not null default now(),
  primary key(scope, key_hash)
);

create index if not exists idx_crm_auth_rate_limits_cleanup
  on public.crm_auth_rate_limits(updated_at);

create table if not exists public.crm_user_sessions (
  session_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  aal text not null default 'aal1' check (aal in ('aal1', 'aal2')),
  created_at timestamptz not null,
  last_seen_at timestamptz not null,
  token_expires_at timestamptz,
  ip_hash text check (ip_hash is null or ip_hash ~ '^[0-9a-f]{64}$'),
  user_agent text,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id) on delete set null,
  revoked_reason text,
  updated_at timestamptz not null default now()
);

create index if not exists idx_crm_user_sessions_user_active
  on public.crm_user_sessions(user_id, last_seen_at desc)
  where revoked_at is null;
create index if not exists idx_crm_user_sessions_agency_active
  on public.crm_user_sessions(agency_id, last_seen_at desc)
  where revoked_at is null;

create or replace function public.crm_auth_rate_limit_check(
  p_scope text,
  p_key_hash text
)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  limit_row public.crm_auth_rate_limits%rowtype;
  policy_row public.crm_auth_policy%rowtype;
begin
  if p_scope not in ('login_account', 'login_ip', 'registration_ip')
    or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_rate_limit_key';
  end if;

  select * into policy_row from public.crm_auth_policy where singleton = true;
  select * into limit_row
  from public.crm_auth_rate_limits
  where scope = p_scope and key_hash = p_key_hash;

  if not found then
    return query select true, 0;
    return;
  end if;

  if limit_row.locked_until is not null and limit_row.locked_until > now() then
    return query select false, greatest(1, ceil(extract(epoch from limit_row.locked_until - now()))::integer);
    return;
  end if;

  if limit_row.window_started_at
      + make_interval(secs => policy_row.attempt_window_seconds) <= now() then
    delete from public.crm_auth_rate_limits
    where scope = p_scope and key_hash = p_key_hash;
  end if;

  return query select true, 0;
end;
$$;

create or replace function public.crm_auth_rate_limit_record(
  p_scope text,
  p_key_hash text,
  p_success boolean
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  limit_row public.crm_auth_rate_limits%rowtype;
  policy_row public.crm_auth_policy%rowtype;
  threshold integer;
  next_count integer;
begin
  if p_scope not in ('login_account', 'login_ip', 'registration_ip')
    or p_key_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_rate_limit_key';
  end if;

  if p_success then
    if p_scope in ('login_account', 'registration_ip') then
      delete from public.crm_auth_rate_limits where scope = p_scope and key_hash = p_key_hash;
    end if;
    return;
  end if;

  select * into policy_row from public.crm_auth_policy where singleton = true;
  threshold := case p_scope
    when 'login_account' then policy_row.account_attempts
    when 'login_ip' then policy_row.ip_attempts
    else policy_row.registration_attempts
  end;

  perform pg_advisory_xact_lock(hashtextextended(p_scope || ':' || p_key_hash, 0));
  select * into limit_row
  from public.crm_auth_rate_limits
  where scope = p_scope and key_hash = p_key_hash
  for update;

  if not found
    or limit_row.window_started_at
      + make_interval(secs => policy_row.attempt_window_seconds) <= now() then
    next_count := 1;
    insert into public.crm_auth_rate_limits(
      scope, key_hash, failure_count, window_started_at, last_failure_at, locked_until, updated_at
    )
    values (
      p_scope, p_key_hash, next_count, now(), now(),
      case when next_count >= threshold
        then now() + make_interval(secs => policy_row.lock_seconds) end,
      now()
    )
    on conflict (scope, key_hash) do update set
      failure_count = excluded.failure_count,
      window_started_at = excluded.window_started_at,
      last_failure_at = excluded.last_failure_at,
      locked_until = excluded.locked_until,
      updated_at = excluded.updated_at;
  else
    next_count := limit_row.failure_count + 1;
    update public.crm_auth_rate_limits
    set failure_count = next_count,
        last_failure_at = now(),
        locked_until = case when next_count >= threshold
          then now() + make_interval(secs => policy_row.lock_seconds)
          else locked_until end,
        updated_at = now()
    where scope = p_scope and key_hash = p_key_hash;
  end if;
end;
$$;

create or replace function public.crm_authorize_app_session(
  p_session_id uuid,
  p_user_id uuid,
  p_aal text,
  p_token_issued_at timestamptz,
  p_token_expires_at timestamptz,
  p_ip_hash text,
  p_user_agent text,
  p_allow_register boolean
)
returns table(
  authorized boolean,
  reason text,
  mfa_required boolean,
  password_change_required boolean,
  session_created_at timestamptz,
  session_last_seen_at timestamptz
)
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  profile_row public.profiles%rowtype;
  session_row public.crm_user_sessions%rowtype;
  policy_row public.crm_auth_policy%rowtype;
  auth_session_created timestamptz;
  has_verified_factor boolean;
  needs_mfa boolean;
  denial_reason text;
begin
  if p_session_id is null or p_user_id is null or p_aal not in ('aal1', 'aal2')
    or (p_ip_hash is not null and p_ip_hash !~ '^[0-9a-f]{64}$') then
    return query select false, 'invalid_session', false, false, null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into profile_row
  from public.profiles
  where user_id = p_user_id and status = 'active'
  limit 1;
  if not found then
    return query select false, 'account_inactive', false, false, null::timestamptz, null::timestamptz;
    return;
  end if;

  select created_at into auth_session_created
  from auth.sessions
  where id = p_session_id and user_id = p_user_id;
  if not found then
    return query select false, 'auth_session_missing', false, profile_row.force_password_change,
      null::timestamptz, null::timestamptz;
    return;
  end if;

  select exists(
    select 1 from auth.mfa_factors factor
    where factor.user_id = p_user_id and factor.status = 'verified'
  ) into has_verified_factor;
  needs_mfa := profile_row.role in ('owner', 'admin') or has_verified_factor;

  select * into session_row
  from public.crm_user_sessions
  where session_id = p_session_id and user_id = p_user_id
  for update;
  if not found then
    if not coalesce(p_allow_register, false) then
      return query select false, 'session_not_registered', needs_mfa,
        profile_row.force_password_change, null::timestamptz, null::timestamptz;
      return;
    end if;
    insert into public.crm_user_sessions(
      session_id, user_id, agency_id, aal, created_at, last_seen_at,
      token_expires_at, ip_hash, user_agent, updated_at
    )
    values (
      p_session_id, p_user_id, profile_row.agency_id, p_aal,
      coalesce(auth_session_created, p_token_issued_at, now()), now(),
      p_token_expires_at, p_ip_hash, left(nullif(p_user_agent, ''), 500), now()
    )
    on conflict (session_id) do nothing;
    select * into session_row
    from public.crm_user_sessions
    where session_id = p_session_id and user_id = p_user_id
    for update;
    if not found then
      return query select false, 'session_owner_mismatch', needs_mfa,
        profile_row.force_password_change, null::timestamptz, null::timestamptz;
      return;
    end if;
  end if;

  select * into policy_row from public.crm_auth_policy where singleton = true;
  denial_reason := case
    when session_row.revoked_at is not null then 'session_revoked'
    when session_row.created_at + make_interval(mins => policy_row.session_max_minutes) <= now()
      then 'session_max_age'
    when session_row.last_seen_at + make_interval(mins => policy_row.session_idle_minutes) <= now()
      then 'session_idle'
    when profile_row.force_password_change then 'password_change_required'
    when needs_mfa and p_aal <> 'aal2' then 'mfa_required'
    else null
  end;

  if denial_reason is null then
    update public.crm_user_sessions
    set aal = p_aal,
        last_seen_at = now(),
        token_expires_at = p_token_expires_at,
        ip_hash = coalesce(p_ip_hash, ip_hash),
        user_agent = coalesce(left(nullif(p_user_agent, ''), 500), user_agent),
        updated_at = now()
    where session_id = p_session_id
    returning * into session_row;
  elsif denial_reason in ('session_max_age', 'session_idle') then
    update public.crm_user_sessions
    set revoked_at = coalesce(revoked_at, now()),
        revoked_reason = coalesce(revoked_reason, denial_reason),
        updated_at = now()
    where session_id = p_session_id
    returning * into session_row;
  end if;

  return query select
    denial_reason is null,
    denial_reason,
    needs_mfa,
    profile_row.force_password_change,
    session_row.created_at,
    session_row.last_seen_at;
end;
$$;

create or replace function public.crm_revoke_user_sessions(
  p_user_id uuid,
  p_agency_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  affected integer;
begin
  if p_user_id is null or p_agency_id is null or p_actor_id is null
    or nullif(trim(p_reason), '') is null then
    raise exception 'invalid_session_revocation';
  end if;

  update public.crm_user_sessions
  set revoked_at = now(),
      revoked_by = p_actor_id,
      revoked_reason = left(p_reason, 120),
      updated_at = now()
  where user_id = p_user_id
    and agency_id = p_agency_id
    and revoked_at is null;
  get diagnostics affected = row_count;
  return affected;
end;
$$;

create or replace function public.crm_prepare_password_change(
  p_user_id uuid,
  p_agency_id uuid,
  p_actor_id uuid,
  p_reason text
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.profiles
  set force_password_change = true,
      security_updated_at = now()
  where user_id = p_user_id
    and agency_id = p_agency_id;
  if not found then
    return false;
  end if;

  perform public.crm_revoke_user_sessions(
    p_user_id, p_agency_id, p_actor_id, p_reason
  );
  return true;
end;
$$;

create or replace function public.crm_complete_password_change(
  p_user_id uuid,
  p_agency_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  update public.profiles
  set force_password_change = false,
      password_changed_at = now(),
      security_updated_at = now()
  where user_id = p_user_id
    and agency_id = p_agency_id;
  return found;
end;
$$;

create or replace function public.crm_session_authorized()
returns boolean
language plpgsql
stable
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  jwt jsonb := auth.jwt();
  session_uuid uuid;
  user_uuid uuid := auth.uid();
  jwt_aal text := coalesce(jwt ->> 'aal', 'aal1');
  allowed boolean;
begin
  begin
    session_uuid := nullif(jwt ->> 'session_id', '')::uuid;
  exception when others then
    return false;
  end;
  if session_uuid is null or user_uuid is null then return false; end if;

  select exists(
    select 1
    from public.crm_user_sessions session
    join public.profiles profile
      on profile.user_id = session.user_id
     and profile.agency_id = session.agency_id
     and profile.status = 'active'
    join public.crm_auth_policy policy on policy.singleton = true
    where session.session_id = session_uuid
      and session.user_id = user_uuid
      and session.revoked_at is null
      and session.created_at + make_interval(mins => policy.session_max_minutes) > now()
      and session.last_seen_at + make_interval(mins => policy.session_idle_minutes) > now()
      and not profile.force_password_change
      and (
        not (
          profile.role in ('owner', 'admin')
          or exists(
            select 1 from auth.mfa_factors factor
            where factor.user_id = user_uuid and factor.status = 'verified'
          )
        )
        or jwt_aal = 'aal2'
      )
  ) into allowed;
  return coalesce(allowed, false);
end;
$$;

alter table public.crm_auth_policy enable row level security;
alter table public.crm_auth_rate_limits enable row level security;
alter table public.crm_user_sessions enable row level security;

revoke all on public.crm_auth_policy, public.crm_auth_rate_limits, public.crm_user_sessions
  from public, anon, authenticated;
grant all on public.crm_auth_policy, public.crm_auth_rate_limits, public.crm_user_sessions
  to service_role;

revoke all on function public.crm_auth_rate_limit_check(text, text)
  from public, anon, authenticated;
revoke all on function public.crm_auth_rate_limit_record(text, text, boolean)
  from public, anon, authenticated;
revoke all on function public.crm_authorize_app_session(
  uuid, uuid, text, timestamptz, timestamptz, text, text, boolean
) from public, anon, authenticated;
revoke all on function public.crm_revoke_user_sessions(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.crm_prepare_password_change(uuid, uuid, uuid, text)
  from public, anon, authenticated;
revoke all on function public.crm_complete_password_change(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.crm_session_authorized()
  from public, anon;
grant execute on function public.crm_auth_rate_limit_check(text, text) to service_role;
grant execute on function public.crm_auth_rate_limit_record(text, text, boolean) to service_role;
grant execute on function public.crm_authorize_app_session(
  uuid, uuid, text, timestamptz, timestamptz, text, text, boolean
) to service_role;
grant execute on function public.crm_revoke_user_sessions(uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.crm_prepare_password_change(uuid, uuid, uuid, text)
  to service_role;
grant execute on function public.crm_complete_password_change(uuid, uuid)
  to service_role;
grant execute on function public.crm_session_authorized() to authenticated, service_role;

-- A restrictive policy augments existing tenant/role policies. It never replaces them.
do $security_gate$
declare table_name text;
begin
  for table_name in
    select class.relname
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relkind in ('r', 'p')
      and class.relrowsecurity
      and class.relname not in (
        'crm_auth_policy', 'crm_auth_rate_limits', 'crm_user_sessions'
      )
  loop
    execute format('drop policy if exists crm_account_security_gate on public.%I', table_name);
    execute format(
      'create policy crm_account_security_gate on public.%I as restrictive for all to authenticated using (public.crm_session_authorized()) with check (public.crm_session_authorized())',
      table_name
    );
  end loop;
end
$security_gate$;

do $storage_security_gate$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists crm_account_security_gate on storage.objects';
    execute 'create policy crm_account_security_gate on storage.objects as restrictive for all to authenticated using (public.crm_session_authorized()) with check (public.crm_session_authorized())';
  end if;
end
$storage_security_gate$;

commit;
