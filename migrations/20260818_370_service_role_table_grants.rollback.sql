-- Revoca granturile acordate de 20260818_370_service_role_table_grants.sql.
-- Atentie: dupa rollback, rutele care folosesc serviceAdmin.from() pe aceste
-- tabele vor esua din nou tacut cu "permission denied for table".

begin;

revoke select, insert, update, delete on table
  public.client_contact_agents,
  public.client_contact_sources,
  public.client_identifiers,
  public.client_merge_candidates,
  public.client_merge_operations,
  public.client_reconciliation_links,
  public.client_reconciliation_runs,
  public.demand_match_refresh_queue,
  public.notifications,
  public.portal_removal_jobs,
  public.property_media_cleanup_jobs,
  public.property_media_events,
  public.security_events,
  public.transaction_events,
  public.transaction_financial_entries
from service_role;

revoke select on table public.crm_role_permissions from service_role;

commit;
