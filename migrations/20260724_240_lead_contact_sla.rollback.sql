-- Non-destructive rollback for the contact SLA. Evidence and timestamps remain.

begin;

drop trigger if exists crm_notify_lead_assignment_trigger on public.leads;
drop trigger if exists zz_crm_prepare_lead_contact_sla_trigger on public.leads;
drop function if exists public.crm_notify_lead_assignment();
drop function if exists public.crm_prepare_lead_contact_sla();
drop function if exists public.crm_process_contact_sla(timestamptz, uuid);
drop function if exists public.crm_contact_sla_dashboard(uuid, uuid, boolean, timestamptz, timestamptz);

alter table public.leads drop constraint if exists leads_contact_sla_status_check;
alter table public.leads drop constraint if exists leads_contact_attempt_count_check;

comment on column public.leads.contact_sla_status is
  'Retained after rollback; historical SLA evidence must not be deleted.';

commit;
