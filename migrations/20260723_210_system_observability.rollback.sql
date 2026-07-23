-- Phase 26 rollback: disable central observability writes, preserve collected history.

begin;

revoke all on function public.crm_start_system_operation(
  uuid, text, text, text, text, text, text, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.crm_finish_system_operation(
  uuid, text, integer, integer, integer, integer, integer,
  text, text, timestamptz, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.crm_record_system_failure(
  uuid, text, text, text, text, text, text, text, integer, jsonb
) from public, anon, authenticated, service_role;
revoke all on function public.crm_mark_stalled_system_operations(interval)
  from public, anon, authenticated, service_role;

drop function if exists public.crm_start_system_operation(
  uuid, text, text, text, text, text, text, jsonb
);
drop function if exists public.crm_finish_system_operation(
  uuid, text, integer, integer, integer, integer, integer,
  text, text, timestamptz, jsonb
);
drop function if exists public.crm_record_system_failure(
  uuid, text, text, text, text, text, text, text, integer, jsonb
);
drop function if exists public.crm_mark_stalled_system_operations(interval);

-- Tables remain intentionally: operational history is not deleted by rollback.
commit;
