-- Non-destructive rollback for deterministic Storia lead assignment.
-- Snapshot columns and their data remain available for audit and recovery.

begin;

drop trigger if exists crm_validate_lead_assignment_trigger on public.leads;
drop function if exists public.crm_validate_lead_assignment();

alter table public.leads drop constraint if exists leads_assignment_status_check;

comment on column public.leads.property_public_code is
  'Retained after rollback; property snapshot data must not be deleted.';
comment on column public.leads.property_public_url is
  'Retained after rollback; property snapshot data must not be deleted.';
comment on column public.leads.property_main_photo_url is
  'Retained after rollback; property snapshot data must not be deleted.';

commit;
