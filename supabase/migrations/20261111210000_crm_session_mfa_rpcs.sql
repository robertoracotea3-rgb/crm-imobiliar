-- Keep the CRM's restrictive session policy in place while registering
-- the authenticated Supabase session that has passed the account's MFA policy.
create or replace function public.crm_sync_session()
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  jwt jsonb := auth.jwt();
  user_uuid uuid := auth.uid();
  session_uuid uuid;
  session_aal text := coalesce(jwt ->> 'aal', 'aal1');
  token_expiry timestamptz;
  auth_session_created timestamptz;
  max_minutes integer;
  idle_minutes integer;
  profile_row public.profiles%rowtype;
  affected_rows integer;
begin
  begin
    session_uuid := nullif(jwt ->> 'session_id', '')::uuid;
    token_expiry := to_timestamp(nullif(jwt ->> 'exp', '')::bigint);
  exception when others then
    raise exception 'Invalid CRM session claims' using errcode = '28000';
  end;

  if user_uuid is null or session_uuid is null or token_expiry is null or token_expiry <= now() then
    raise exception 'A valid signed-in CRM session is required' using errcode = '28000';
  end if;

  select s.created_at
    into auth_session_created
    from auth.sessions s
   where s.id = session_uuid
     and s.user_id = user_uuid;

  if not found then
    raise exception 'Supabase session not found; sign in again' using errcode = '28000';
  end if;

  select p.*
    into profile_row
    from public.profiles p
   where p.user_id = user_uuid;

  if not found or profile_row.status <> 'active' or coalesce(profile_row.force_password_change, true) then
    raise exception 'CRM profile is inactive or requires a password change' using errcode = '42501';
  end if;

  select policy.session_max_minutes, policy.session_idle_minutes
    into max_minutes, idle_minutes
    from public.crm_auth_policy policy
   where policy.singleton = true;

  if max_minutes is null or idle_minutes is null
     or auth_session_created + make_interval(mins => max_minutes) <= now() then
    raise exception 'CRM session expired; sign in again' using errcode = '28000';
  end if;

  if profile_row.role in ('owner', 'admin')
     or exists (
       select 1
         from auth.mfa_factors factor
        where factor.user_id = user_uuid
          and factor.status = 'verified'
     ) then
    if session_aal <> 'aal2' then
      raise exception 'MFA verification is required for this CRM account' using errcode = '42501';
    end if;
  end if;

  insert into public.crm_user_sessions (
    session_id,
    user_id,
    agency_id,
    aal,
    created_at,
    last_seen_at,
    token_expires_at
  )
  values (
    session_uuid,
    user_uuid,
    profile_row.agency_id,
    session_aal,
    auth_session_created,
    now(),
    token_expiry
  )
  on conflict (session_id) do update
     set agency_id = excluded.agency_id,
         aal = excluded.aal,
         last_seen_at = now(),
         token_expires_at = excluded.token_expires_at
   where public.crm_user_sessions.user_id = excluded.user_id
     and public.crm_user_sessions.revoked_at is null
     and public.crm_user_sessions.created_at + make_interval(mins => max_minutes) > now()
     and public.crm_user_sessions.last_seen_at + make_interval(mins => idle_minutes) > now();

  get diagnostics affected_rows = row_count;
  if affected_rows = 0 then
    raise exception 'CRM session expired or revoked; sign in again' using errcode = '28000';
  end if;
end;
$function$;

create or replace function public.crm_revoke_session()
returns void
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'auth'
as $function$
declare
  jwt jsonb := auth.jwt();
  user_uuid uuid := auth.uid();
  session_uuid uuid;
begin
  begin
    session_uuid := nullif(jwt ->> 'session_id', '')::uuid;
  exception when others then
    return;
  end;

  if user_uuid is null or session_uuid is null then
    return;
  end if;

  update public.crm_user_sessions
     set revoked_at = now(),
         revoked_by = user_uuid,
         revoked_reason = 'user_signout'
   where session_id = session_uuid
     and user_id = user_uuid
     and revoked_at is null;
end;
$function$;

revoke all on function public.crm_sync_session() from public;
revoke all on function public.crm_sync_session() from anon;
grant execute on function public.crm_sync_session() to authenticated;

revoke all on function public.crm_revoke_session() from public;
revoke all on function public.crm_revoke_session() from anon;
grant execute on function public.crm_revoke_session() to authenticated;
