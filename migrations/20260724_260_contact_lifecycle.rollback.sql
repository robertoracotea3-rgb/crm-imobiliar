-- Non-destructive rollback. Lifecycle data and history remain available.

begin;

drop trigger if exists crm_guard_contact_lifecycle_update_trigger on public.contacts;
drop trigger if exists crm_record_initial_contact_lifecycle_trigger on public.contacts;
drop trigger if exists crm_reactivate_contact_from_new_lead_trigger on public.leads;
drop trigger if exists crm_sync_contact_from_interaction_trigger
  on public.lead_contact_interactions;
drop trigger if exists crm_activate_contact_from_demand_trigger on public.demands;
drop trigger if exists crm_activate_contact_from_viewing_trigger on public.calendar_events;
drop trigger if exists crm_activate_contact_from_transaction_trigger on public.transactions;

drop function if exists public.crm_refresh_contact_lifecycle(timestamptz, uuid, integer);
drop function if exists public.crm_activate_contact_from_business_record();
drop function if exists public.crm_sync_contact_from_interaction();
drop function if exists public.crm_reactivate_contact_from_new_lead();
drop function if exists public.crm_transition_contact_lifecycle(
  uuid, uuid, uuid, text, text, text
);
drop function if exists public.crm_apply_contact_lifecycle(
  uuid, uuid, text, uuid, text, text, text, jsonb, timestamptz
);
drop function if exists public.crm_guard_contact_lifecycle_update();
drop function if exists public.crm_contact_lifecycle_blockers(
  uuid, uuid, text, timestamptz, integer
);
drop function if exists public.crm_contact_last_relevant_activity(uuid, uuid);
drop function if exists public.crm_record_initial_contact_lifecycle();

comment on table public.contact_lifecycle_events is
  'Retained after rollback; client lifecycle history must not be deleted.';
comment on column public.contacts.lifecycle_status is
  'Retained after rollback; this business state must not be converted into deleted_at.';

commit;
