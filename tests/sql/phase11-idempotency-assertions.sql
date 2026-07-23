do $$
begin
  if (select count(*) from public.notifications) <>
      (select notification_count from public.phase11_test_marker) then
    raise exception 'idempotency changed notification count';
  end if;
  if (select read_at from public.notifications
      where dedup_key='new_lead:11000000-0000-0000-0000-000000000001') is distinct from
      (select read_at from public.phase11_test_marker) then
    raise exception 'idempotency reset persistent read state';
  end if;
  if exists(
    select 1 from public.notifications
    group by agency_id,user_id,dedup_key having count(*)>1
  ) then raise exception 'idempotency created duplicate notifications'; end if;
end $$;

select 'phase11 idempotency assertions passed' as result;
