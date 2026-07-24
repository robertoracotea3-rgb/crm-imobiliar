-- Non-destructive rollback. Review and closure history is retained.

begin;

drop trigger if exists crm_notify_closed_demands_on_new_lead_trigger on public.leads;
drop trigger if exists crm_prepare_demand_review_dates_trigger on public.demands;
drop trigger if exists crm_guard_demand_review_status_trigger on public.demands;

drop function if exists public.crm_notify_closed_demands_on_new_lead();
drop function if exists public.crm_review_demand(
  uuid, uuid, uuid, text, text, text, text, timestamptz, text
);
drop function if exists public.crm_mark_demands_for_review(timestamptz, uuid, integer);
drop function if exists public.crm_prepare_demand_review_dates();
drop function if exists public.crm_guard_demand_review_status();
drop function if exists public.crm_demand_review_blockers(
  uuid, uuid, timestamptz, integer, boolean
);
drop function if exists public.crm_demand_last_relevant_activity(
  uuid, uuid, timestamptz
);

comment on table public.demand_review_events is
  'Retained after rollback; demand review and closure history must not be deleted.';
comment on column public.demands.close_reason_code is
  'Retained after rollback so closed demands keep their factual reason.';

commit;
