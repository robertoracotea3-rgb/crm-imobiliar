do $$
begin
 if to_regprocedure('public.crm_finalize_transaction(uuid,uuid,uuid)') is not null
  then raise exception 'finalization function survived rollback'; end if;
 if to_regclass('public.transaction_financial_entries') is null
  or to_regclass('public.portal_removal_jobs') is null then
  raise exception 'rollback deleted operational history'; end if;
 if (select status from public.transactions where id='51000000-0000-0000-0000-000000000002')<>'finalizata'
  then raise exception 'rollback changed finalized transaction'; end if;
 if (select count(*) from public.transaction_financial_entries where transaction_id='51000000-0000-0000-0000-000000000002')<>2
  then raise exception 'rollback deleted financial records'; end if;
end $$;
select 'phase12 rollback assertions passed' as result;
