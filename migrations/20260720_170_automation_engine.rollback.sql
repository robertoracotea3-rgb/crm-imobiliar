begin;

drop trigger if exists crm_automation_lead_created on public.leads;
drop trigger if exists crm_automation_viewing_completed on public.calendar_events;
drop trigger if exists crm_automation_demand_created on public.demands;
drop trigger if exists crm_automation_property_created on public.properties;
drop trigger if exists crm_automation_property_sold on public.properties;
drop trigger if exists crm_automation_listing_error on public.portal_listings;
drop trigger if exists crm_seed_new_agency_automations_trigger on public.agencies;
drop trigger if exists crm_dispatch_automation_event_trigger on public.automation_events;

drop function if exists public.crm_retry_automation_job(uuid,uuid);
drop function if exists public.crm_finish_automation_job(uuid,boolean,jsonb,text,integer);
drop function if exists public.crm_claim_automation_jobs(integer,uuid);
drop function if exists public.crm_sweep_due_automations(timestamptz,uuid);
drop function if exists public.crm_capture_automation_event();
drop function if exists public.crm_enqueue_automation_event(uuid,text,text,text,text,jsonb,timestamptz);
drop function if exists public.crm_dispatch_automation_event();
drop function if exists public.crm_seed_new_agency_automations();
drop function if exists public.crm_seed_automation_rules(uuid);

-- Preserve audit history when used. Pending/retry work is cancelled so rollback
-- never leaves an executable orphan.
update public.automation_jobs set status='cancelled',completed_at=now(),locked_at=null,updated_at=now()
where status in ('pending','processing','retry');

comment on table public.automation_rules is
  'Automation engine rolled back. Configuration and audit history preserved intentionally.';

commit;
