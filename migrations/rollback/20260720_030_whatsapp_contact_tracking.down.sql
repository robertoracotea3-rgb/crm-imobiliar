-- Non-destructive rollback: retain factual contact history and only remove the helper index.

begin;
revoke all on function public.record_whatsapp_outcome(uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated, service_role;
drop function if exists public.record_whatsapp_outcome(uuid, uuid, uuid, text, timestamptz);
drop index if exists public.leads_next_action_idx;
comment on column public.leads.last_contact_attempt_at is
  'Preserved after rollback so historical contact attempts are not lost.';
comment on column public.leads.last_contacted_at is
  'Preserved after rollback so historical confirmed contacts are not lost.';
commit;
