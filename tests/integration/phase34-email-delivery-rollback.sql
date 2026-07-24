\set ON_ERROR_STOP on

do $$
begin
  if to_regclass('public.agency_email_settings') is null
     or to_regclass('public.email_delivery_logs') is null then
    raise exception 'non_destructive_email_rollback_removed_evidence';
  end if;
  if has_table_privilege('authenticated', 'public.agency_email_settings', 'INSERT')
     or has_table_privilege('authenticated', 'public.agency_email_settings', 'UPDATE')
     or has_table_privilege('authenticated', 'public.email_delivery_logs', 'SELECT') then
    raise exception 'email_rollback_kept_authenticated_access';
  end if;
end
$$;

select 'phase34_email_delivery_rollback_ok';
