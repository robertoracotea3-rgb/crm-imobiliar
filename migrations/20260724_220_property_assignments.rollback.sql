-- Non-destructive rollback for operational property assignments.
-- Assignment columns and history remain available for audit and later restoration.

begin;

revoke all on function public.crm_assign_properties(
  uuid, uuid, uuid[], uuid, text, boolean, boolean, boolean, boolean, boolean
) from public, anon, authenticated, service_role;
drop function if exists public.crm_assign_properties(
  uuid, uuid, uuid[], uuid, text, boolean, boolean, boolean, boolean, boolean
);

drop trigger if exists crm_record_property_assignment_trigger on public.properties;
drop trigger if exists crm_validate_property_assignment_trigger on public.properties;
drop function if exists public.crm_record_property_assignment();
drop function if exists public.crm_validate_property_assignment();

alter table public.properties drop constraint if exists properties_active_assignment_check;
alter table public.properties drop constraint if exists properties_assignment_status_check;

create or replace function public.crm_can_access_property(p_property_id uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.properties property
    where property.id = p_property_id
      and property.agency_id = public.current_crm_agency_id()
      and public.crm_has_permission('properties', p_action)
      and public.crm_can_access_row('properties', array[property.agent_id]::uuid[])
  )
$$;

comment on table public.property_assignment_history is
  'Retained after rollback; assignment history must not be deleted.';

commit;
