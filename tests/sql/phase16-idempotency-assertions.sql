do $$
begin
  if (select count(*) from public.portal_listings)<>2 then
    raise exception 'idempotent migration changed listing count';
  end if;
  if (select count(*) from public.portal_listing_checks)<>4 then
    raise exception 'idempotent migration changed check history';
  end if;
  if (select count(*) from public.portal_sync_runs)<>2 then
    raise exception 'idempotent migration changed sync history';
  end if;
  if (select count(*) from information_schema.columns
    where table_schema='public' and table_name='portal_listings'
      and column_name in ('last_checked_at','last_check_result','remote_status',
        'remote_exists','last_error_code','agent_id'))<>6 then
    raise exception 'idempotent migration changed listing schema';
  end if;
end
$$;
select 'phase16 idempotency assertions passed' as result;
