-- Non-destructive rollback: keep configuration and delivery evidence.

begin;

drop policy if exists agency_email_settings_manage on public.agency_email_settings;
drop policy if exists agency_email_settings_read on public.agency_email_settings;
drop policy if exists email_delivery_logs_read on public.email_delivery_logs;

revoke insert, update on public.agency_email_settings from authenticated;
revoke select on public.agency_email_settings, public.email_delivery_logs from authenticated;

comment on table public.agency_email_settings is
  'Retained after rollback to avoid losing verified email configuration.';
comment on table public.email_delivery_logs is
  'Retained after rollback as operational delivery evidence.';

commit;
