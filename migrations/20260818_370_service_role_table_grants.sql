-- Rutele server folosesc clientul service_role direct pe aceste tabele
-- (serviceAdmin.from('...')), dar migrarile care le-au creat au acordat
-- drepturi doar rolului `authenticated` si EXECUTE pe RPC-urile SECURITY
-- DEFINER. Rezultatul: fiecare acces esueaza cu "permission denied for table",
-- iar erorile sunt inghitite de .catch()/sourceErrors, deci nu se vede nimic.
--
-- Consecinte masurate inainte de reparatie:
--   - demand_match_refresh_queue: 5 randuri pending din 30 iulie, attempts=0
--     (coada nu putea fi nici macar revendicata);
--   - /api/system/health raporta surse indisponibile;
--   - panoul de notificari din dashboard ramanea gol;
--   - notificarile bazate pe timp aruncau eroare la upsert;
--   - security_events nu inregistra refuzurile de permisiune.
--
-- service_role este cheie exclusiv server-side si oricum ocoleste RLS; restul
-- schemei ii acorda deja aceste drepturi (vezi feed_tokens, portal_tokens etc.).
-- Migrarea aliniaza cele 16 tabele ramase la aceeasi conventie.

begin;

grant select, insert, update, delete on table
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
to service_role;

-- Catalogul de permisiuni pe roluri este doar citit de server, niciodata scris.
grant select on table public.crm_role_permissions to service_role;

commit;
