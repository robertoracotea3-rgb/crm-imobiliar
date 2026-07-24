\set ON_ERROR_STOP on

do $$
begin
  if to_regclass('public.weekly_reports') is null
     or to_regclass('public.weekly_report_records') is null then
    raise exception 'weekly_report_rollback_removed_archive';
  end if;
  if has_table_privilege('authenticated', 'public.weekly_reports', 'SELECT')
     or has_table_privilege('authenticated', 'public.weekly_report_records', 'SELECT') then
    raise exception 'weekly_report_rollback_kept_authenticated_access';
  end if;
  if has_function_privilege(
    'service_role',
    'public.crm_claim_weekly_report_emails(timestamptz,uuid,integer)',
    'EXECUTE'
  ) then
    raise exception 'weekly_report_rollback_kept_scheduler_access';
  end if;
end
$$;

select 'phase35_weekly_reports_rollback_ok';
