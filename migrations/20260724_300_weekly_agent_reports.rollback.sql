-- Non-destructive rollback: preserve the generated archive and metric evidence.

begin;

revoke execute on function public.crm_generate_weekly_report(
  uuid, timestamptz, timestamptz, uuid
) from service_role;
revoke execute on function public.crm_claim_weekly_report_emails(
  timestamptz, uuid, integer
) from service_role;
revoke execute on function public.crm_seed_weekly_report_settings()
  from service_role;
drop trigger if exists crm_seed_weekly_report_settings_trigger on public.agencies;
drop policy if exists agency_weekly_report_settings_manage
  on public.agency_weekly_report_settings;
drop policy if exists agency_weekly_report_settings_read
  on public.agency_weekly_report_settings;
drop policy if exists weekly_reports_read on public.weekly_reports;
drop policy if exists weekly_report_records_read on public.weekly_report_records;
revoke insert, update on public.agency_weekly_report_settings from authenticated;
revoke select on public.agency_weekly_report_settings,
  public.weekly_reports, public.weekly_report_records from authenticated;

comment on table public.weekly_reports is
  'Retained after rollback to preserve the historical report archive.';
comment on table public.weekly_report_records is
  'Retained after rollback to preserve exact metric evidence.';

commit;
