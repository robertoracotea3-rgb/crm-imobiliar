do $$
declare result jsonb; job_id uuid; rejected boolean;
begin
 if not (select legacy_import from public.transactions where id='51000000-0000-0000-0000-000000000001') then
  raise exception 'incomplete historical transaction was not marked legacy';
 end if;
 if (select search_text from public.transactions where id='51000000-0000-0000-0000-000000000002')
    not like '%kira-1%client a%' then raise exception 'transaction search snapshot missing'; end if;

 rejected:=false;
 begin
  insert into public.transactions(agency_id,agent_id,type,status,sale_price,currency,created_by)
  values('10000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
    'vanzare','draft',100,'EUR','aaaaaaaa-0000-0000-0000-000000000001');
 exception when others then rejected:=sqlerrm like '%transaction_required_links_missing%'; end;
 if not rejected then raise exception 'incomplete new transaction was accepted'; end if;

 rejected:=false;
 begin
  insert into public.transactions(agency_id,property_id,contact_id,agent_id,type,status,sale_price,currency,created_by)
  values('10000000-0000-0000-0000-000000000001','42000000-0000-0000-0000-000000000002',
    '31000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
    'vanzare','draft',100,'EUR','aaaaaaaa-0000-0000-0000-000000000001');
 exception when others then rejected:=sqlerrm like '%transaction_property_not_in_agency%'; end;
 if not rejected then raise exception 'cross-agency property was accepted'; end if;

 select public.crm_finalize_transaction(
  '10000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000001') into result;
 if (select status from public.transactions where id='51000000-0000-0000-0000-000000000002')<>'finalizata'
   then raise exception 'transaction not finalized'; end if;
 if (select status from public.properties where id='41000000-0000-0000-0000-000000000001')<>'tranzactionata'
   then raise exception 'property not closed atomically'; end if;
 if (select count(*) from public.transaction_financial_entries where transaction_id='51000000-0000-0000-0000-000000000002')<>2
   then raise exception 'financial entries missing'; end if;
 if (select count(*) from public.portal_removal_jobs where transaction_id='51000000-0000-0000-0000-000000000002')<>1
   then raise exception 'removal outbox missing'; end if;
 if (select status from public.portal_listings where id='61000000-0000-0000-0000-000000000001')<>'pending_removal'
   then raise exception 'listing was not marked pending removal'; end if;

 perform public.crm_finalize_transaction(
  '10000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000002',
  'aaaaaaaa-0000-0000-0000-000000000001');
 if (select count(*) from public.transaction_financial_entries where transaction_id='51000000-0000-0000-0000-000000000002')<>2
   or (select count(*) from public.portal_removal_jobs where transaction_id='51000000-0000-0000-0000-000000000002')<>1
   or (select count(*) from public.transaction_events where transaction_id='51000000-0000-0000-0000-000000000002')<>1
   then raise exception 'finalization is not idempotent'; end if;

 select id into job_id from public.crm_claim_portal_removal_jobs(
  '10000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000002',null,5);
 if job_id is null then raise exception 'removal job was not claimed'; end if;
 perform public.crm_finish_portal_removal_job(
  '10000000-0000-0000-0000-000000000001',job_id,false,'portal unavailable',now());
 if (select status from public.transactions where id='51000000-0000-0000-0000-000000000002')<>'finalizata'
   then raise exception 'portal failure reverted transaction'; end if;
 if (select status from public.portal_listings where id='61000000-0000-0000-0000-000000000001')<>'removal_failed'
   then raise exception 'portal failure was hidden'; end if;
 perform 1 from public.crm_claim_portal_removal_jobs(
  '10000000-0000-0000-0000-000000000001','51000000-0000-0000-0000-000000000002',job_id,1);
 perform public.crm_finish_portal_removal_job(
  '10000000-0000-0000-0000-000000000001',job_id,true,null,null);
 if (select status from public.portal_listings where id='61000000-0000-0000-0000-000000000001')<>'deleted'
   or (select status from public.portal_removal_jobs where id=job_id)<>'confirmed'
   then raise exception 'confirmed removal not persisted'; end if;
end $$;

insert into public.transaction_financial_entries(
  agency_id,transaction_id,entry_type,amount,currency,created_by
) values(
  '20000000-0000-0000-0000-000000000002','52000000-0000-0000-0000-000000000002',
  'agency_commission',1600,'EUR','bbbbbbbb-0000-0000-0000-000000000002'
);
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',false);
do $$
begin
  if exists(select 1 from public.transaction_financial_entries
    where agency_id='20000000-0000-0000-0000-000000000002') then
    raise exception 'cross-agency financial leak';
  end if;
  if not exists(select 1 from public.transaction_financial_entries
    where agency_id='10000000-0000-0000-0000-000000000001') then
    raise exception 'own financial entries are not visible';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);

select 'phase12 assertions passed' as result;
