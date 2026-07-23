do $$
declare
  run_a uuid;
  run_b uuid;
  result jsonb;
begin
  if exists(select 1 from public.portal_listings where agent_id is null) then
    raise exception 'listing agent backfill failed';
  end if;
  if exists(select 1 from public.portal_listings where last_check_result<>'never') then
    raise exception 'historical local status was incorrectly treated as verified';
  end if;

  run_a:=public.crm_start_portal_sync_run(
    'aaaaaaaa-0000-0000-0000-000000000001','storia','cron','2026-07-23'
  );
  if run_a is null then raise exception 'agency A sync did not start'; end if;
  if public.crm_start_portal_sync_run(
    'aaaaaaaa-0000-0000-0000-000000000001','storia','manual',null
  ) is not null then raise exception 'overlapping agency A sync was accepted'; end if;
  run_b:=public.crm_start_portal_sync_run(
    'bbbbbbbb-0000-0000-0000-000000000001','storia','cron','2026-07-23'
  );
  if run_b is null then raise exception 'agency B independent sync did not start'; end if;

  result:=public.crm_record_portal_listing_check(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'aaaaaaaa-3000-0000-0000-000000000001',run_a,now(),'verified','active',true,
    'aaaaaaaa-4000-0000-0000-000000000001','12345678',
    'https://www.storia.ro/ro/oferta/apartament-IDabc.html',
    null,null,jsonb_build_object('status','active'),jsonb_build_object('data','safe'),12,
    'aaaaaaaa-1000-0000-0000-000000000001'
  );
  if result->>'status'<>'active' or result->>'changed'<>'true' then
    raise exception 'verified agency A status invalid: %',result;
  end if;
  if (select last_check_result from public.portal_listings
      where id='aaaaaaaa-3000-0000-0000-000000000001')<>'verified' then
    raise exception 'successful verification was not recorded';
  end if;
  if (select portal_ad_id from public.portal_listings
      where id='aaaaaaaa-3000-0000-0000-000000000001')<>'12345678' then
    raise exception 'public portal id was not persisted';
  end if;
  if (select advert_url from public.portal_listings
      where id='aaaaaaaa-3000-0000-0000-000000000001') not like 'https://www.storia.ro/%' then
    raise exception 'public advert URL was not persisted';
  end if;

  perform public.crm_record_portal_listing_check(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'aaaaaaaa-3000-0000-0000-000000000001',run_a,now(),'error',null,null,
    null,null,null,'metadata_http_503','Portal temporar indisponibil',
    jsonb_build_object('error_code','metadata_http_503'),null,20,
    'aaaaaaaa-1000-0000-0000-000000000001'
  );
  if (select status from public.portal_listings
      where id='aaaaaaaa-3000-0000-0000-000000000001')<>'error' then
    raise exception 'failed verification remained falsely active';
  end if;
  if (select remote_status from public.portal_listings
      where id='aaaaaaaa-3000-0000-0000-000000000001')<>'active' then
    raise exception 'last known remote status was not retained';
  end if;
  if (select consecutive_check_failures from public.portal_listings
      where id='aaaaaaaa-3000-0000-0000-000000000001')<>1 then
    raise exception 'failure counter invalid';
  end if;
  if not exists(select 1 from public.notifications
    where agency_id='aaaaaaaa-0000-0000-0000-000000000001'
      and type='portal_listing_error') then
    raise exception 'listing error did not alert agency A';
  end if;

  perform public.crm_record_portal_listing_check(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'aaaaaaaa-3000-0000-0000-000000000001',run_a,now(),'verified','active',true,
    'aaaaaaaa-4000-0000-0000-000000000001','12345678',
    'https://www.storia.ro/ro/oferta/apartament-IDabc.html',
    null,null,'{}'::jsonb,'{}'::jsonb,9,
    'aaaaaaaa-1000-0000-0000-000000000001'
  );
  if (select consecutive_check_failures from public.portal_listings
      where id='aaaaaaaa-3000-0000-0000-000000000001')<>0 then
    raise exception 'successful recovery did not reset failures';
  end if;

  begin
    perform public.crm_record_portal_listing_check(
      'aaaaaaaa-0000-0000-0000-000000000001',
      'bbbbbbbb-3000-0000-0000-000000000001',run_a,now(),'verified','active',true,
      null,null,null,null,null,'{}'::jsonb,'{}'::jsonb,1,null
    );
    raise exception 'cross-agency listing check was accepted';
  exception when others then
    if sqlerrm='cross-agency listing check was accepted' then raise; end if;
  end;
  begin
    perform public.crm_record_portal_listing_check(
      'aaaaaaaa-0000-0000-0000-000000000001',
      'aaaaaaaa-3000-0000-0000-000000000001',run_a,now(),'verified','active',true,
      null,null,null,null,null,'{}'::jsonb,'{}'::jsonb,1,
      'bbbbbbbb-1000-0000-0000-000000000001'
    );
    raise exception 'cross-agency agent assignment was accepted';
  exception when others then
    if sqlerrm='cross-agency agent assignment was accepted' then raise; end if;
  end;

  perform public.crm_record_portal_listing_check(
    'bbbbbbbb-0000-0000-0000-000000000001',
    'bbbbbbbb-3000-0000-0000-000000000001',run_b,now(),'not_found','deleted',false,
    'bbbbbbbb-4000-0000-0000-000000000001',null,null,null,
    'Anunț absent','{}'::jsonb,'{}'::jsonb,7,
    'bbbbbbbb-1000-0000-0000-000000000001'
  );
  if (select status from public.portal_listings
      where id='bbbbbbbb-3000-0000-0000-000000000001')<>'deleted' then
    raise exception 'missing agency B listing stayed active';
  end if;

  if not public.crm_finish_portal_sync_run(
    'aaaaaaaa-0000-0000-0000-000000000001',run_a,'completed',3,1,3,0,1,0,null,null
  ) then raise exception 'agency A sync run did not finish'; end if;
  if not public.crm_finish_portal_sync_run(
    'bbbbbbbb-0000-0000-0000-000000000001',run_b,'completed',1,0,1,1,0,0,null,null
  ) then raise exception 'agency B sync run did not finish'; end if;
end
$$;

update public.portal_listings
set last_checked_at=now()-interval '2 days',stale_alerted_at=null,status='active',
    remote_status='active',remote_exists=true,last_check_result='verified'
where id='aaaaaaaa-3000-0000-0000-000000000001';

do $$
begin
  if public.crm_mark_stale_portal_listings(
    'aaaaaaaa-0000-0000-0000-000000000001','storia',interval '36 hours'
  )<>1 then raise exception 'stale agency A listing was not alerted'; end if;
  if public.crm_mark_stale_portal_listings(
    'aaaaaaaa-0000-0000-0000-000000000001','storia',interval '36 hours'
  )<>1 then raise exception 'stale agency A total became inaccurate'; end if;
  if (select count(*) from public.notifications
      where agency_id='aaaaaaaa-0000-0000-0000-000000000001'
        and type='portal_listing_stale')<>1 then
    raise exception 'stale agency A alert was duplicated';
  end if;
  if exists(select 1 from public.notifications
    where agency_id='bbbbbbbb-0000-0000-0000-000000000001'
      and type='portal_listing_stale') then
    raise exception 'agency A stale alert leaked into agency B';
  end if;
end
$$;

set role authenticated;
do $$
begin
  begin
    perform * from public.portal_listing_checks;
    raise exception 'authenticated role read listing check audit';
  exception when insufficient_privilege then null;
  end;
  begin
    perform * from public.portal_sync_runs;
    raise exception 'authenticated role read sync runs';
  exception when insufficient_privilege then null;
  end;
end
$$;
reset role;

select 'phase16 assertions passed' as result;
