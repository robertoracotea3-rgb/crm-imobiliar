do $$
declare
  before_count integer;
  after_count integer;
  read_timestamp timestamptz;
begin
  if not exists(select 1 from public.notifications where dedup_key='new_lead:11000000-0000-0000-0000-000000000001') then
    raise exception 'new lead was not backfilled';
  end if;
  if not exists(select 1 from public.notifications where dedup_key='lead_uncontacted:11000000-0000-0000-0000-000000000001') then
    raise exception 'uncontacted lead was not backfilled';
  end if;
  if not exists(select 1 from public.notifications where dedup_key='task_overdue:12000000-0000-0000-0000-000000000001') then
    raise exception 'overdue task was not backfilled';
  end if;
  if not exists(select 1 from public.notifications where dedup_key='viewing_reminder:13000000-0000-0000-0000-000000000001') then
    raise exception 'viewing was not backfilled';
  end if;
  if not exists(select 1 from public.notifications where dedup_key='demand_match:16000000-0000-0000-0000-000000000001') then
    raise exception 'match was not backfilled';
  end if;
  if not exists(select 1 from public.notifications where dedup_key='property_expired:15000000-0000-0000-0000-000000000001') then
    raise exception 'expired property was not backfilled';
  end if;
  if not exists(select 1 from public.notifications where dedup_key='portal_error:17000000-0000-0000-0000-000000000001') then
    raise exception 'portal error was not backfilled';
  end if;
  if not exists(select 1 from public.notifications where dedup_key='webhook_error:18000000-0000-0000-0000-000000000001'
    and user_id='aaaaaaaa-0000-0000-0000-000000000099') then
    raise exception 'webhook rejection was not routed to the manager';
  end if;
  if not exists(select 1 from public.notifications where dedup_key='transaction:19000000-0000-0000-0000-000000000001') then
    raise exception 'transaction was not backfilled';
  end if;

  update public.property_documents set expires_at=now()-interval '1 day'
    where id='1a000000-0000-0000-0000-000000000001';
  if not exists(select 1 from public.notifications where dedup_key='document_expired:1a000000-0000-0000-0000-000000000001') then
    raise exception 'expired document trigger did not create a notification';
  end if;

  insert into public.leads values
    ('11000000-0000-0000-0000-000000000099','10000000-0000-0000-0000-000000000001',
     'aaaaaaaa-0000-0000-0000-000000000001',null,null,'Lead din trigger','new',now(),null);
  if not exists(select 1 from public.notifications where dedup_key='new_lead:11000000-0000-0000-0000-000000000099') then
    raise exception 'new lead trigger did not create a notification';
  end if;

  select count(*) into before_count from public.notifications;
  update public.notifications set read_at=now()
    where dedup_key='new_lead:11000000-0000-0000-0000-000000000001';
  select read_at into read_timestamp from public.notifications
    where dedup_key='new_lead:11000000-0000-0000-0000-000000000001';
  perform public.crm_enqueue_notification(
    '10000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
    'new_lead','Lead nou','Mesaj actualizat','lead','11000000-0000-0000-0000-000000000001',
    'high','/clients/11000000-0000-0000-0000-000000000001',
    'new_lead:11000000-0000-0000-0000-000000000001','{}'::jsonb
  );
  select count(*) into after_count from public.notifications;
  if after_count <> before_count then raise exception 'deduplication created an extra row'; end if;
  if (select read_at from public.notifications
      where dedup_key='new_lead:11000000-0000-0000-0000-000000000001') is distinct from read_timestamp then
    raise exception 'deduplication reset persistent read state';
  end if;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',false);
do $$
declare content_update_rejected boolean := false;
begin
  if exists(select 1 from public.notifications where agency_id='20000000-0000-0000-0000-000000000002') then
    raise exception 'cross-agency notification leak';
  end if;
  if exists(select 1 from public.notifications where user_id<>'aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'cross-user notification leak';
  end if;
  if not exists(select 1 from public.notifications) then
    raise exception 'agent cannot read own notifications';
  end if;
  update public.notifications set read_at=now()
    where dedup_key='task_overdue:12000000-0000-0000-0000-000000000001';
  begin
    update public.notifications set title='Conținut falsificat'
      where dedup_key='task_overdue:12000000-0000-0000-0000-000000000001';
  exception when insufficient_privilege then content_update_rejected := true; end;
  if not content_update_rejected then raise exception 'agent could alter notification content'; end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);

select 'phase11 assertions passed' as result;
