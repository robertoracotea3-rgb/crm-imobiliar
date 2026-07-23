\set ON_ERROR_STOP on

do $$
declare
  agency uuid := '25000000-0000-4000-8000-000000000001';
  owner_user uuid := '25000000-0000-4000-8000-000000000002';
  agent_user uuid := '25000000-0000-4000-8000-000000000003';
  owner_session uuid := '25000000-0000-4000-8000-000000000004';
  agent_session uuid := '25000000-0000-4000-8000-000000000005';
  decision record;
  limiter record;
begin
  delete from public.crm_auth_rate_limits
  where scope = 'login_account' and key_hash = repeat('a', 64);
  delete from public.crm_user_sessions where session_id in (owner_session, agent_session);
  delete from auth.mfa_factors where user_id in (owner_user, agent_user);
  delete from public.profiles where user_id in (owner_user, agent_user);
  delete from auth.sessions where id in (owner_session, agent_session);
  delete from auth.users where id in (owner_user, agent_user);
  delete from public.agencies where id = agency;

  insert into public.agencies(id, name) values (agency, 'Phase 25 Agency');
  insert into auth.users(id, email, raw_user_meta_data) values
    (owner_user, 'owner-phase25@fortis.crm', '{"username":"owner-phase25"}'),
    (agent_user, 'agent-phase25@fortis.crm', '{"username":"agent-phase25"}');
  insert into public.profiles(user_id, agency_id, role, status) values
    (owner_user, agency, 'owner', 'active'),
    (agent_user, agency, 'agent', 'active');
  insert into auth.sessions(id, user_id, created_at) values
    (owner_session, owner_user, now()),
    (agent_session, agent_user, now());

  select * into decision from public.crm_authorize_app_session(
    owner_session, owner_user, 'aal1', now(), now() + interval '1 hour',
    repeat('1', 64), 'Phase25 browser', false
  );
  if decision.authorized or decision.reason <> 'session_not_registered' then
    raise exception 'A session outside the Kira login flow was accepted';
  end if;

  select * into decision from public.crm_authorize_app_session(
    owner_session, owner_user, 'aal1', now(), now() + interval '1 hour',
    repeat('1', 64), 'Phase25 browser', true
  );
  if decision.authorized or decision.reason <> 'mfa_required' or not decision.mfa_required then
    raise exception 'Owner AAL1 was not blocked for MFA';
  end if;

  insert into auth.mfa_factors(user_id, status, factor_type)
  values (owner_user, 'verified', 'totp');
  select * into decision from public.crm_authorize_app_session(
    owner_session, owner_user, 'aal2', now(), now() + interval '1 hour',
    repeat('1', 64), 'Phase25 browser', false
  );
  if not decision.authorized or decision.reason is not null then
    raise exception 'Owner AAL2 session was not authorized';
  end if;

  select * into decision from public.crm_authorize_app_session(
    agent_session, agent_user, 'aal1', now(), now() + interval '1 hour',
    repeat('2', 64), 'Phase25 agent browser', true
  );
  if not decision.authorized or decision.mfa_required then
    raise exception 'Agent without MFA was blocked';
  end if;

  update public.profiles set force_password_change = true where user_id = agent_user;
  select * into decision from public.crm_authorize_app_session(
    agent_session, agent_user, 'aal1', now(), now() + interval '1 hour',
    repeat('2', 64), 'Phase25 agent browser', false
  );
  if decision.authorized or decision.reason <> 'password_change_required' then
    raise exception 'Forced password change was not enforced';
  end if;

  update public.profiles set force_password_change = false where user_id = agent_user;
  if not public.crm_prepare_password_change(
    agent_user, agency, owner_user, 'integration_password_change'
  ) then
    raise exception 'Password-change preparation did not find the profile';
  end if;
  if not exists(
    select 1 from public.profiles
    where user_id = agent_user and force_password_change
  ) or not exists(
    select 1 from public.crm_user_sessions
    where session_id = agent_session
      and revoked_at is not null
      and revoked_reason = 'integration_password_change'
  ) then
    raise exception 'Password-change preparation was not atomic';
  end if;
  if not public.crm_complete_password_change(agent_user, agency) then
    raise exception 'Password-change completion did not find the profile';
  end if;
  if exists(
    select 1 from public.profiles
    where user_id = agent_user and force_password_change
  ) or not exists(
    select 1 from public.profiles
    where user_id = agent_user and password_changed_at is not null
  ) then
    raise exception 'Password-change completion did not persist';
  end if;

  for counter in 1..5 loop
    perform public.crm_auth_rate_limit_record(
      'login_account', repeat('a', 64), false
    );
  end loop;
  select * into limiter from public.crm_auth_rate_limit_check(
    'login_account', repeat('a', 64)
  );
  if limiter.allowed or limiter.retry_after_seconds <= 0 then
    raise exception 'Persistent account lock was not enforced';
  end if;

  perform public.crm_auth_rate_limit_record(
    'login_account', repeat('a', 64), true
  );
  select * into limiter from public.crm_auth_rate_limit_check(
    'login_account', repeat('a', 64)
  );
  if not limiter.allowed then
    raise exception 'Successful login did not clear account lock';
  end if;
end
$$;

select 'phase25_account_security_ok';
