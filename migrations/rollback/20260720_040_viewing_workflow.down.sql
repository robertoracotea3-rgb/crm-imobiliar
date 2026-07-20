-- Non-destructive rollback: disable workflow RPCs while preserving all viewings and history.

begin;
drop function if exists public.transition_crm_viewing(uuid,uuid,uuid,text,timestamptz,integer,text,text,text,text,timestamptz);
drop function if exists public.create_crm_viewing(uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,integer,text,text,jsonb,timestamptz);
drop index if exists public.calendar_events_agent_upcoming_idx;
drop index if exists public.calendar_events_property_viewing_idx;
drop index if exists public.calendar_events_lead_idx;
comment on table public.calendar_events is
  'Viewing workflow columns and historical rows are intentionally preserved after rollback.';
commit;
