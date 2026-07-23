-- Non-destructive rollback for Phase 23.
-- Audit rows and immutability protections are deliberately preserved.

begin;

revoke execute on function public.crm_append_audit_event(
  uuid, uuid, text, text, text, text, jsonb, jsonb, text, text, text, text, text, text, jsonb
) from service_role;
revoke execute on function public.crm_verify_audit_chain(uuid) from service_role;
revoke select on public.crm_audit_log from authenticated;

drop policy if exists crm_audit_log_read on public.crm_audit_log;

comment on table public.crm_audit_log is
  'Preserved after application rollback. Historical audit events remain immutable and unavailable to application roles.';

commit;
