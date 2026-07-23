-- Phase 15: secure, tenant-bound Storia OAuth and encrypted portal credentials.
-- Apply after 20260720_050_permissions_and_rls.sql and before the matching app release.

begin;

create table if not exists public.portal_tokens(
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null,
  portal text not null default 'storia',
  access_token text,
  refresh_token text,
  token_type text default 'Bearer',
  expires_at timestamptz,
  scope text,
  created_at timestamptz default now(),
  updated_at timestamptz default now(),
  unique(agency_id,portal)
);

alter table public.portal_tokens add column if not exists access_token_ciphertext text;
alter table public.portal_tokens add column if not exists refresh_token_ciphertext text;
alter table public.portal_tokens add column if not exists encryption_version text;
alter table public.portal_tokens add column if not exists connection_status text not null default 'disconnected';
alter table public.portal_tokens add column if not exists connected_by uuid references auth.users(id);
alter table public.portal_tokens add column if not exists connected_at timestamptz;
alter table public.portal_tokens add column if not exists revoked_by uuid references auth.users(id);
alter table public.portal_tokens add column if not exists revoked_at timestamptz;
alter table public.portal_tokens add column if not exists revocation_reason text;
alter table public.portal_tokens add column if not exists last_refreshed_at timestamptz;
alter table public.portal_tokens add column if not exists last_used_at timestamptz;
alter table public.portal_tokens add column if not exists refresh_failure_count integer not null default 0;
alter table public.portal_tokens add column if not exists last_refresh_error_code text;
alter table public.portal_tokens add column if not exists refresh_lock_id uuid;
alter table public.portal_tokens add column if not exists refresh_lock_until timestamptz;

-- Existing plaintext credentials remain usable only long enough for the
-- application to encrypt them in place with PORTAL_TOKEN_ENCRYPTION_KEY.
update public.portal_tokens
set connection_status='connected',
    connected_at=coalesce(connected_at,created_at,now())
where portal='storia'
  and connection_status='disconnected'
  and (access_token is not null or access_token_ciphertext is not null);

alter table public.portal_tokens drop constraint if exists portal_tokens_connection_status_check;
alter table public.portal_tokens add constraint portal_tokens_connection_status_check
  check(connection_status in ('disconnected','connected','reconnect_required','revoked')) not valid;
alter table public.portal_tokens validate constraint portal_tokens_connection_status_check;
alter table public.portal_tokens drop constraint if exists portal_tokens_refresh_failure_count_check;
alter table public.portal_tokens add constraint portal_tokens_refresh_failure_count_check
  check(refresh_failure_count>=0) not valid;
alter table public.portal_tokens validate constraint portal_tokens_refresh_failure_count_check;

do $$
begin
  if not exists(
    select 1 from pg_constraint
    where conrelid='public.portal_tokens'::regclass
      and conname='portal_tokens_agency_fk'
  ) then
    alter table public.portal_tokens
      add constraint portal_tokens_agency_fk foreign key(agency_id)
      references public.agencies(id) on delete restrict not valid;
  end if;
end $$;
alter table public.portal_tokens validate constraint portal_tokens_agency_fk;

create table if not exists public.portal_oauth_sessions(
  id uuid primary key default gen_random_uuid(),
  portal text not null,
  state_hash text not null unique,
  session_hash text not null,
  agency_id uuid not null references public.agencies(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete restrict,
  redirect_path text not null default '/portals',
  status text not null default 'pending'
    check(status in ('pending','exchanging','completed','failed','expired','cancelled')),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  completed_at timestamptz,
  error_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check(length(state_hash)=64),
  check(length(session_hash)=64),
  check(redirect_path like '/%' and redirect_path not like '//%')
);
create index if not exists portal_oauth_sessions_pending_idx
  on public.portal_oauth_sessions(portal,expires_at)
  where status='pending';
create index if not exists portal_oauth_sessions_actor_idx
  on public.portal_oauth_sessions(agency_id,user_id,created_at desc);

create table if not exists public.portal_token_events(
  id bigint generated always as identity primary key,
  agency_id uuid not null references public.agencies(id) on delete restrict,
  user_id uuid references auth.users(id) on delete set null,
  portal text not null,
  token_id uuid references public.portal_tokens(id) on delete set null,
  oauth_session_id uuid references public.portal_oauth_sessions(id) on delete set null,
  event_type text not null
    check(event_type in (
      'connected','reconnected','legacy_encrypted','refreshed',
      'refresh_failed','revoked','oauth_failed'
    )),
  result text not null check(result in ('success','failed')),
  error_code text,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists portal_token_events_agency_idx
  on public.portal_token_events(agency_id,created_at desc);
create index if not exists portal_token_events_token_idx
  on public.portal_token_events(token_id,created_at desc);

create or replace function public.crm_consume_portal_oauth_session(
  p_portal text,p_state_hash text
) returns table(
  session_id uuid,agency_id uuid,user_id uuid,redirect_path text
) language plpgsql security definer set search_path=public,pg_temp as $$
declare
  session_row public.portal_oauth_sessions%rowtype;
begin
  update public.portal_oauth_sessions session
  set status=case when session.expires_at>now() then 'exchanging' else 'expired' end,
      consumed_at=case when session.expires_at>now() then now() else session.consumed_at end,
      updated_at=now()
  where session.id=(
    select candidate.id
    from public.portal_oauth_sessions candidate
    where candidate.portal=p_portal
      and candidate.state_hash=p_state_hash
      and candidate.status='pending'
    for update
  )
  returning session.* into session_row;

  if not found or session_row.status<>'exchanging' then return; end if;

  return query select session_row.id,session_row.agency_id,session_row.user_id,session_row.redirect_path;
end
$$;

create or replace function public.crm_complete_portal_oauth(
  p_session_id uuid,
  p_access_token_ciphertext text,
  p_refresh_token_ciphertext text,
  p_encryption_version text,
  p_token_type text,
  p_expires_at timestamptz,
  p_scope text
) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$
declare
  session_row public.portal_oauth_sessions%rowtype;
  token_row public.portal_tokens%rowtype;
  was_connected boolean;
begin
  select * into session_row from public.portal_oauth_sessions
  where id=p_session_id and status='exchanging' for update;
  if not found then raise exception 'portal_oauth_session_not_exchangeable'; end if;
  if p_access_token_ciphertext not like 'v1.%'
    or p_refresh_token_ciphertext not like 'v1.%'
    or p_encryption_version<>'v1'
    or p_expires_at<=now() then
    raise exception 'portal_oauth_token_payload_invalid';
  end if;

  select exists(
    select 1 from public.portal_tokens
    where agency_id=session_row.agency_id and portal=session_row.portal
      and connection_status in ('connected','reconnect_required','revoked')
  ) into was_connected;

  insert into public.portal_tokens(
    agency_id,portal,access_token,refresh_token,
    access_token_ciphertext,refresh_token_ciphertext,encryption_version,
    token_type,expires_at,scope,connection_status,connected_by,connected_at,
    revoked_by,revoked_at,revocation_reason,last_refreshed_at,last_used_at,
    refresh_failure_count,last_refresh_error_code,refresh_lock_id,refresh_lock_until,
    created_at,updated_at
  ) values(
    session_row.agency_id,session_row.portal,null,null,
    p_access_token_ciphertext,p_refresh_token_ciphertext,p_encryption_version,
    coalesce(nullif(p_token_type,''),'Bearer'),p_expires_at,p_scope,'connected',
    session_row.user_id,now(),null,null,null,null,null,0,null,null,null,now(),now()
  )
  on conflict(agency_id,portal) do update set
    access_token=null,
    refresh_token=null,
    access_token_ciphertext=excluded.access_token_ciphertext,
    refresh_token_ciphertext=excluded.refresh_token_ciphertext,
    encryption_version=excluded.encryption_version,
    token_type=excluded.token_type,
    expires_at=excluded.expires_at,
    scope=excluded.scope,
    connection_status='connected',
    connected_by=excluded.connected_by,
    connected_at=excluded.connected_at,
    revoked_by=null,
    revoked_at=null,
    revocation_reason=null,
    last_refreshed_at=null,
    last_used_at=null,
    refresh_failure_count=0,
    last_refresh_error_code=null,
    refresh_lock_id=null,
    refresh_lock_until=null,
    updated_at=now()
  returning * into token_row;

  update public.portal_oauth_sessions
  set status='completed',completed_at=now(),updated_at=now()
  where id=session_row.id;

  insert into public.portal_token_events(
    agency_id,user_id,portal,token_id,oauth_session_id,event_type,result,details
  ) values(
    session_row.agency_id,session_row.user_id,session_row.portal,token_row.id,session_row.id,
    case when was_connected then 'reconnected' else 'connected' end,'success',
    jsonb_build_object('expires_at',p_expires_at,'scope',coalesce(p_scope,''))
  );
  return token_row.id;
end
$$;

create or replace function public.crm_fail_portal_oauth(
  p_session_id uuid,p_error_code text
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare session_row public.portal_oauth_sessions%rowtype;
begin
  update public.portal_oauth_sessions
  set status='failed',error_code=left(coalesce(p_error_code,'oauth_failed'),80),updated_at=now()
  where id=p_session_id and status in ('pending','exchanging')
  returning * into session_row;
  if not found then return false; end if;
  insert into public.portal_token_events(
    agency_id,user_id,portal,oauth_session_id,event_type,result,error_code
  ) values(
    session_row.agency_id,session_row.user_id,session_row.portal,session_row.id,
    'oauth_failed','failed',left(coalesce(p_error_code,'oauth_failed'),80)
  );
  return true;
end
$$;

create or replace function public.crm_claim_portal_token_refresh(
  p_agency_id uuid,p_portal text,p_lock_id uuid
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare claimed_count integer;
begin
  update public.portal_tokens
  set refresh_lock_id=p_lock_id,refresh_lock_until=now()+interval '90 seconds',updated_at=now()
  where agency_id=p_agency_id and portal=p_portal
    and connection_status='connected'
    and coalesce(expires_at,'epoch'::timestamptz)<=now()+interval '5 minutes'
    and (refresh_lock_until is null or refresh_lock_until<now());
  get diagnostics claimed_count=row_count;
  return claimed_count=1;
end
$$;

create or replace function public.crm_complete_portal_token_refresh(
  p_agency_id uuid,p_portal text,p_lock_id uuid,
  p_access_token_ciphertext text,p_refresh_token_ciphertext text,
  p_encryption_version text,p_expires_at timestamptz,p_scope text
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare token_row public.portal_tokens%rowtype;
begin
  if p_access_token_ciphertext not like 'v1.%'
    or p_refresh_token_ciphertext not like 'v1.%'
    or p_encryption_version<>'v1'
    or p_expires_at<=now() then
    raise exception 'portal_refresh_payload_invalid';
  end if;
  update public.portal_tokens
  set access_token=null,refresh_token=null,
      access_token_ciphertext=p_access_token_ciphertext,
      refresh_token_ciphertext=p_refresh_token_ciphertext,
      encryption_version=p_encryption_version,expires_at=p_expires_at,
      scope=coalesce(p_scope,scope),connection_status='connected',
      last_refreshed_at=now(),refresh_failure_count=0,last_refresh_error_code=null,
      refresh_lock_id=null,refresh_lock_until=null,updated_at=now()
  where agency_id=p_agency_id and portal=p_portal and refresh_lock_id=p_lock_id
  returning * into token_row;
  if not found then return false; end if;
  insert into public.portal_token_events(
    agency_id,portal,token_id,event_type,result,details
  ) values(
    p_agency_id,p_portal,token_row.id,'refreshed','success',
    jsonb_build_object('expires_at',p_expires_at)
  );
  return true;
end
$$;

create or replace function public.crm_fail_portal_token_refresh(
  p_agency_id uuid,p_portal text,p_lock_id uuid,
  p_error_code text,p_reconnect_required boolean
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare token_row public.portal_tokens%rowtype;
begin
  update public.portal_tokens
  set connection_status=case when p_reconnect_required then 'reconnect_required' else connection_status end,
      refresh_failure_count=refresh_failure_count+1,
      last_refresh_error_code=left(coalesce(p_error_code,'refresh_failed'),80),
      refresh_lock_id=null,refresh_lock_until=null,updated_at=now()
  where agency_id=p_agency_id and portal=p_portal and refresh_lock_id=p_lock_id
  returning * into token_row;
  if not found then return false; end if;
  insert into public.portal_token_events(
    agency_id,portal,token_id,event_type,result,error_code,details
  ) values(
    p_agency_id,p_portal,token_row.id,'refresh_failed','failed',
    left(coalesce(p_error_code,'refresh_failed'),80),
    jsonb_build_object('reconnect_required',p_reconnect_required)
  );
  return true;
end
$$;

create or replace function public.crm_record_legacy_token_encryption(
  p_agency_id uuid,p_portal text,p_token_id uuid
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
begin
  if not exists(
    select 1 from public.portal_tokens
    where id=p_token_id and agency_id=p_agency_id and portal=p_portal
      and access_token is null and refresh_token is null
      and access_token_ciphertext is not null and refresh_token_ciphertext is not null
  ) then return false; end if;
  insert into public.portal_token_events(
    agency_id,portal,token_id,event_type,result
  ) values(p_agency_id,p_portal,p_token_id,'legacy_encrypted','success');
  return true;
end
$$;

create or replace function public.crm_revoke_portal_connection(
  p_agency_id uuid,p_portal text,p_actor_id uuid,p_reason text
) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$
declare token_row public.portal_tokens%rowtype;
begin
  if not exists(
    select 1 from public.profiles
    where user_id=p_actor_id and agency_id=p_agency_id and coalesce(status,'active')='active'
  ) then raise exception 'portal_revoke_actor_not_in_agency'; end if;

  update public.portal_tokens
  set access_token=null,refresh_token=null,
      access_token_ciphertext=null,refresh_token_ciphertext=null,
      connection_status='revoked',revoked_by=p_actor_id,revoked_at=now(),
      revocation_reason=left(coalesce(nullif(p_reason,''),'user_disconnect'),160),
      refresh_lock_id=null,refresh_lock_until=null,updated_at=now()
  where agency_id=p_agency_id and portal=p_portal
  returning * into token_row;
  if not found then return false; end if;

  update public.portal_oauth_sessions
  set status='cancelled',updated_at=now()
  where agency_id=p_agency_id and portal=p_portal and status='pending';

  insert into public.portal_token_events(
    agency_id,user_id,portal,token_id,event_type,result,details
  ) values(
    p_agency_id,p_actor_id,p_portal,token_row.id,'revoked','success',
    jsonb_build_object('reason',token_row.revocation_reason)
  );
  return true;
end
$$;

alter table public.portal_tokens enable row level security;
alter table public.portal_oauth_sessions enable row level security;
alter table public.portal_token_events enable row level security;
revoke all on public.portal_tokens from public,anon,authenticated;
revoke all on public.portal_oauth_sessions from public,anon,authenticated;
revoke all on public.portal_token_events from public,anon,authenticated;
grant all on public.portal_tokens,public.portal_oauth_sessions,public.portal_token_events to service_role;

revoke all on function public.crm_consume_portal_oauth_session(text,text) from public,anon,authenticated;
revoke all on function public.crm_complete_portal_oauth(uuid,text,text,text,text,timestamptz,text) from public,anon,authenticated;
revoke all on function public.crm_fail_portal_oauth(uuid,text) from public,anon,authenticated;
revoke all on function public.crm_claim_portal_token_refresh(uuid,text,uuid) from public,anon,authenticated;
revoke all on function public.crm_complete_portal_token_refresh(uuid,text,uuid,text,text,text,timestamptz,text)
  from public,anon,authenticated;
revoke all on function public.crm_fail_portal_token_refresh(uuid,text,uuid,text,boolean)
  from public,anon,authenticated;
revoke all on function public.crm_record_legacy_token_encryption(uuid,text,uuid)
  from public,anon,authenticated;
revoke all on function public.crm_revoke_portal_connection(uuid,text,uuid,text)
  from public,anon,authenticated;
grant execute on function public.crm_consume_portal_oauth_session(text,text) to service_role;
grant execute on function public.crm_complete_portal_oauth(uuid,text,text,text,text,timestamptz,text) to service_role;
grant execute on function public.crm_fail_portal_oauth(uuid,text) to service_role;
grant execute on function public.crm_claim_portal_token_refresh(uuid,text,uuid) to service_role;
grant execute on function public.crm_complete_portal_token_refresh(uuid,text,uuid,text,text,text,timestamptz,text)
  to service_role;
grant execute on function public.crm_fail_portal_token_refresh(uuid,text,uuid,text,boolean)
  to service_role;
grant execute on function public.crm_record_legacy_token_encryption(uuid,text,uuid)
  to service_role;
grant execute on function public.crm_revoke_portal_connection(uuid,text,uuid,text)
  to service_role;

commit;
