begin;

drop function if exists public.crm_finish_portal_removal_job(uuid,uuid,boolean,text,timestamptz);
drop function if exists public.crm_claim_portal_removal_jobs(uuid,uuid,uuid,integer);
drop function if exists public.crm_finalize_transaction(uuid,uuid,uuid);
drop trigger if exists crm_validate_transaction_trigger on public.transactions;
drop function if exists public.crm_validate_and_snapshot_transaction();

alter table public.transactions drop constraint if exists transactions_required_links_check;
alter table public.transactions drop constraint if exists transactions_money_check;

-- Operational data created after deployment is retained for audit/recovery.
-- New tables are dropped only when no workflow has written to them.
do $$
begin
  if to_regclass('public.transaction_events') is not null
    and not exists(select 1 from public.transaction_events) then drop table public.transaction_events; end if;
  if to_regclass('public.portal_removal_jobs') is not null
    and not exists(select 1 from public.portal_removal_jobs) then drop table public.portal_removal_jobs; end if;
  if to_regclass('public.transaction_financial_entries') is not null
    and not exists(select 1 from public.transaction_financial_entries) then drop table public.transaction_financial_entries; end if;
end $$;

commit;
