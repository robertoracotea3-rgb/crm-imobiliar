-- Non-destructive rollback for Phase 7.
-- It disables reconciliation/merge behavior while retaining canonical links,
-- merge snapshots and historical identifiers for audit and later restoration.

begin;

drop trigger if exists crm_sync_transaction_contact_agent_trigger on public.transactions;
drop trigger if exists crm_sync_viewing_contact_agent_trigger on public.calendar_events;
drop trigger if exists crm_sync_demand_contact_agent_trigger on public.demands;
drop trigger if exists crm_fill_activity_contact_trigger on public.activities;
drop trigger if exists crm_sync_lead_client_links_trigger on public.leads;
drop trigger if exists crm_prepare_lead_identity_trigger on public.leads;
drop trigger if exists crm_sync_contact_identifiers_trigger on public.contacts;
drop trigger if exists crm_prepare_contact_identity_trigger on public.contacts;

drop function if exists public.crm_sync_contact_agent_link();
drop function if exists public.crm_fill_activity_contact();
drop function if exists public.crm_sync_lead_client_links();
drop function if exists public.crm_prepare_lead_identity();
drop function if exists public.crm_sync_contact_identifiers();
drop function if exists public.crm_prepare_contact_identity();

revoke all on function public.resolve_crm_contact(uuid,uuid,text,text,text,uuid,text,text,text) from service_role;
revoke all on function public.merge_crm_contacts(uuid,uuid,uuid,uuid,text) from service_role;
revoke all on function public.revert_crm_contact_merge(uuid,uuid,uuid,text) from service_role;

-- Restore the original Phase 5 ownership rules for contacts.
drop policy if exists crm_contacts_select on public.contacts;
create policy crm_contacts_select on public.contacts for select to authenticated using (
  agency_id = public.current_crm_agency_id()
  and public.crm_has_permission('contacts', 'view')
  and public.crm_can_access_row('contacts', array[agent_id, created_by]::uuid[])
);
drop policy if exists crm_contacts_update on public.contacts;
create policy crm_contacts_update on public.contacts for update to authenticated using (
  agency_id = public.current_crm_agency_id()
  and public.crm_has_permission('contacts', 'edit')
  and public.crm_can_access_row('contacts', array[agent_id, created_by]::uuid[])
) with check (
  agency_id = public.current_crm_agency_id()
  and public.crm_has_permission('contacts', 'edit')
  and (public.crm_has_permission('contacts', 'manage_all') or public.crm_has_permission('contacts', 'assign') or agent_id = auth.uid())
);

insert into public.client_reconciliation_runs(mode, details, completed_at)
values ('dry_run', jsonb_build_object('rollback', true, 'retained_history', true), now());

commit;
