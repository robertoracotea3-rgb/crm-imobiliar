do $$
begin
  if exists (
    select 1 from pg_trigger where tgname = 'crm_prepare_lead_identity_trigger' and not tgisinternal
  ) then raise exception 'lead identity trigger still active'; end if;
  if not exists (select 1 from public.client_merge_operations) then raise exception 'merge audit was deleted'; end if;
  if not exists (select 1 from public.client_reconciliation_runs) then raise exception 'reconciliation audit was deleted'; end if;
  if not exists (select 1 from public.leads where contact_id is not null) then raise exception 'canonical links were destructively removed'; end if;
end $$;

select 'phase7 rollback assertions passed' as result;
