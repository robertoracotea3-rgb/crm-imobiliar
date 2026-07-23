do $$
declare trigger_count integer;
begin
  if to_regclass('public.notifications') is not null then raise exception 'notifications table survived rollback'; end if;
  if to_regprocedure('public.crm_emit_notification_from_change()') is not null then
    raise exception 'notification trigger function survived rollback';
  end if;
  select count(*) into trigger_count from pg_trigger
    where tgname='crm_notification_event_trigger' and not tgisinternal;
  if trigger_count <> 0 then raise exception 'notification triggers survived rollback'; end if;
  if not exists(
    select 1 from information_schema.columns
    where table_schema='public' and table_name='property_documents' and column_name='expires_at'
  ) then raise exception 'rollback deleted document expiry data'; end if;
  if (select expires_at from public.property_documents
      where id='1a000000-0000-0000-0000-000000000001') is null then
    raise exception 'document expiry value was not preserved';
  end if;
  if not exists(select 1 from public.leads where id='11000000-0000-0000-0000-000000000001') then
    raise exception 'business data was deleted by rollback';
  end if;
end $$;

select 'phase11 rollback assertions passed' as result;
