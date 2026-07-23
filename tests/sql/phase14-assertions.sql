insert into public.portal_oauth_sessions(
  id,portal,state_hash,session_hash,agency_id,user_id,expires_at
) values
(
  'aaaaaaaa-3000-0000-0000-000000000001','storia',repeat('a',64),repeat('1',64),
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-1000-0000-0000-000000000001',now()+interval '10 minutes'
),(
  'bbbbbbbb-3000-0000-0000-000000000001','storia',repeat('b',64),repeat('2',64),
  'bbbbbbbb-0000-0000-0000-000000000001',
  'bbbbbbbb-1000-0000-0000-000000000001',now()+interval '10 minutes'
),(
  'aaaaaaaa-3000-0000-0000-000000000002','storia',repeat('c',64),repeat('3',64),
  'aaaaaaaa-0000-0000-0000-000000000001',
  'aaaaaaaa-1000-0000-0000-000000000001',now()-interval '1 minute'
);

do $$
declare
  oauth_a record;
  oauth_b record;
  token_a uuid;
  token_b uuid;
  replay_count integer;
  expired_count integer;
begin
  select * into oauth_a from public.crm_consume_portal_oauth_session('storia',repeat('a',64));
  if oauth_a.agency_id<>'aaaaaaaa-0000-0000-0000-000000000001'::uuid
    or oauth_a.user_id<>'aaaaaaaa-1000-0000-0000-000000000001'::uuid then
    raise exception 'OAuth state was not bound to agency A';
  end if;

  select count(*) into replay_count
  from public.crm_consume_portal_oauth_session('storia',repeat('a',64));
  if replay_count<>0 then raise exception 'OAuth state replay was accepted'; end if;

  select count(*) into expired_count
  from public.crm_consume_portal_oauth_session('storia',repeat('c',64));
  if expired_count<>0 then raise exception 'expired OAuth state was accepted'; end if;

  token_a:=public.crm_complete_portal_oauth(
    oauth_a.session_id,'v1.iv.tag.cipher-a','v1.iv.tag.refresh-a','v1','Bearer',
    now()+interval '1 hour','read:adverts write:adverts'
  );
  if token_a is null then raise exception 'agency A token was not stored'; end if;

  select * into oauth_b from public.crm_consume_portal_oauth_session('storia',repeat('b',64));
  token_b:=public.crm_complete_portal_oauth(
    oauth_b.session_id,'v1.iv.tag.cipher-b','v1.iv.tag.refresh-b','v1','Bearer',
    now()+interval '1 minute','read:adverts write:adverts'
  );
  if token_b is null or token_b=token_a then raise exception 'agency B token was not isolated'; end if;

  if (select count(*) from public.portal_tokens where connection_status='connected')<>2 then
    raise exception 'two-agency connection count invalid';
  end if;
  if exists(select 1 from public.portal_tokens where access_token is not null or refresh_token is not null) then
    raise exception 'plaintext tokens were persisted';
  end if;

  begin
    perform public.crm_revoke_portal_connection(
      'bbbbbbbb-0000-0000-0000-000000000001','storia',
      'aaaaaaaa-1000-0000-0000-000000000001','cross_tenant_attempt'
    );
    raise exception 'cross-tenant revocation was accepted';
  exception when others then
    if sqlerrm='cross-tenant revocation was accepted' then raise; end if;
  end;

  if not public.crm_revoke_portal_connection(
    'aaaaaaaa-0000-0000-0000-000000000001','storia',
    'aaaaaaaa-1000-0000-0000-000000000001','user_disconnect'
  ) then raise exception 'agency A revocation failed'; end if;
  if (select connection_status from public.portal_tokens
    where agency_id='aaaaaaaa-0000-0000-0000-000000000001')<>'revoked' then
    raise exception 'agency A token stayed connected';
  end if;
  if (select connection_status from public.portal_tokens
    where agency_id='bbbbbbbb-0000-0000-0000-000000000001')<>'connected' then
    raise exception 'agency A revocation affected agency B';
  end if;
end
$$;

do $$
declare
  lock_id uuid:='bbbbbbbb-4000-0000-0000-000000000001';
begin
  if not public.crm_claim_portal_token_refresh(
    'bbbbbbbb-0000-0000-0000-000000000001','storia',lock_id
  ) then raise exception 'expired agency B token was not claimed'; end if;
  if public.crm_claim_portal_token_refresh(
    'bbbbbbbb-0000-0000-0000-000000000001','storia',
    'bbbbbbbb-4000-0000-0000-000000000002'
  ) then raise exception 'parallel token refresh was accepted'; end if;
  if not public.crm_complete_portal_token_refresh(
    'bbbbbbbb-0000-0000-0000-000000000001','storia',lock_id,
    'v1.iv.tag.cipher-b2','v1.iv.tag.refresh-b2','v1',
    now()+interval '1 hour','read:adverts write:adverts'
  ) then raise exception 'token refresh completion failed'; end if;
  if (select refresh_failure_count from public.portal_tokens
    where agency_id='bbbbbbbb-0000-0000-0000-000000000001')<>0 then
    raise exception 'refresh failure counter was not reset';
  end if;
end
$$;

set role authenticated;
do $$
begin
  begin
    perform * from public.portal_tokens;
    raise exception 'authenticated role read encrypted credentials';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.crm_consume_portal_oauth_session('storia',repeat('d',64));
    raise exception 'authenticated role executed OAuth RPC';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

do $$
begin
  if (select count(*) from public.portal_token_events where agency_id=
    'aaaaaaaa-0000-0000-0000-000000000001')<>2 then
    raise exception 'agency A audit trail incomplete';
  end if;
  if (select count(*) from public.portal_token_events where agency_id=
    'bbbbbbbb-0000-0000-0000-000000000001')<>2 then
    raise exception 'agency B audit trail incomplete';
  end if;
end
$$;

select 'phase14 assertions passed' as result;
