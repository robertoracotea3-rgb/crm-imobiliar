-- Non-destructive rollback for Phase 10. Catalog/audit tables remain available.
begin;

drop trigger if exists enforce_lead_status_transition on public.leads;
drop trigger if exists enforce_property_status_transition on public.properties;
drop trigger if exists enforce_viewing_status_transition on public.calendar_events;
drop trigger if exists enforce_transaction_status_transition on public.transactions;

alter table public.leads drop constraint if exists leads_source_normalized_fk;
alter table public.demands drop constraint if exists demands_source_normalized_fk;
alter table public.activities drop constraint if exists activities_type_fk;

update public.leads set status=legacy_status where legacy_status is not null and legacy_status <> '__NULL__';
update public.properties set status=legacy_status where legacy_status is not null and legacy_status <> '__NULL__';
update public.calendar_events set status=case when legacy_status='__NULL__' then null else legacy_status end where legacy_status is not null;
update public.transactions set status=case when legacy_status='__NULL__' then null else legacy_status end where legacy_status is not null;
update public.demands set status=legacy_status where legacy_status is not null and legacy_status <> '__NULL__';

comment on table public.crm_normalization_runs is
  'Phase 10 was rolled back; retained for audit and a safe future re-application.';

commit;
