\set ON_ERROR_STOP on

begin;

insert into auth.users(id,email) values
  ('00000000-0000-4000-8000-000000000022','agent@example.invalid'),
  ('00000000-0000-4000-8000-000000000099','other@example.invalid');
insert into public.agencies(id,name) values
  ('00000000-0000-4000-8000-000000000011','Agency E2E'),
  ('00000000-0000-4000-8000-000000000098','Other Agency E2E');
insert into public.profiles(user_id,agency_id,status) values
  ('00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000011','active'),
  ('00000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000098','active');
insert into public.properties(id,agency_id,agent_id,internal_code,title,status) values
  ('00000000-0000-4000-8000-000000000033','00000000-0000-4000-8000-000000000011',
   '00000000-0000-4000-8000-000000000022','KIRA-E2E-1','Property E2E','activa');
insert into public.contacts(id,agency_id,full_name,phone) values
  ('00000000-0000-4000-8000-000000000055','00000000-0000-4000-8000-000000000011',
   'Client E2E','40722123456');
insert into public.leads(id,agency_id,contact_name,contact_phone,agent_id,status) values
  ('00000000-0000-4000-8000-000000000066','00000000-0000-4000-8000-000000000011',
   'Client E2E','40722123456','00000000-0000-4000-8000-000000000022','new');
insert into public.portal_listings(
  id,agency_id,property_id,portal,external_id,status
) values (
  '00000000-0000-4000-8000-000000000088','00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000033','storia','storia-e2e-uuid','active'
);

do $$
declare
  viewing_id uuid;
  transition_result jsonb;
begin
  viewing_id := public.create_crm_viewing(
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000022',
    '00000000-0000-4000-8000-000000000066',
    '00000000-0000-4000-8000-000000000055',
    '00000000-0000-4000-8000-000000000033',
    '00000000-0000-4000-8000-000000000022',
    now() + interval '1 day',
    60,
    'Fagaras',
    'Synthetic viewing',
    '["Client E2E","Agent E2E"]'::jsonb,
    now() + interval '23 hours'
  );

  if not exists(
    select 1 from public.calendar_events
    where id=viewing_id and status='programata'
      and lead_id='00000000-0000-4000-8000-000000000066'
      and contact_id='00000000-0000-4000-8000-000000000055'
      and property_id='00000000-0000-4000-8000-000000000033'
  ) then raise exception 'viewing_links_missing'; end if;
  if (select status from public.leads where id='00000000-0000-4000-8000-000000000066') <> 'upcoming_viewing'
  then raise exception 'lead_not_moved_to_upcoming_viewing'; end if;

  transition_result := public.transition_crm_viewing(
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000022',
    viewing_id,
    'complete',
    null,null,null,
    'Client interested',
    'Positive',
    'Owner informed',
    now() + interval '2 days'
  );
  if transition_result->>'action' <> 'complete' then raise exception 'viewing_transition_failed'; end if;
  if (select status from public.calendar_events where id=viewing_id) <> 'efectuata'
  then raise exception 'viewing_not_completed'; end if;
  if not exists(select 1 from public.tasks where lead_id='00000000-0000-4000-8000-000000000066')
  then raise exception 'viewing_followup_missing'; end if;
end $$;

insert into public.transactions(
  id,agency_id,property_id,contact_id,agent_id,lead_id,type,status,sale_price,currency,
  agency_commission,agent_commission
) values (
  '00000000-0000-4000-8000-000000000077','00000000-0000-4000-8000-000000000011',
  '00000000-0000-4000-8000-000000000033','00000000-0000-4000-8000-000000000055',
  '00000000-0000-4000-8000-000000000022','00000000-0000-4000-8000-000000000066',
  'vanzare','oferta',100000,'EUR',3000,1000
);

do $$
declare
  result jsonb;
  repeated jsonb;
  claimed record;
  finish_status text;
begin
  result := public.crm_finalize_transaction(
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000077',
    '00000000-0000-4000-8000-000000000022'
  );
  if result->>'property_status' <> 'tranzactionata' then raise exception 'property_not_finalized'; end if;
  if (result->>'financial_entries')::integer <> 2 then raise exception 'financial_entries_missing'; end if;
  if (result->>'removal_jobs')::integer <> 1 then raise exception 'removal_job_missing'; end if;

  repeated := public.crm_finalize_transaction(
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000077',
    '00000000-0000-4000-8000-000000000022'
  );
  if (repeated->>'already_finalized')::boolean is not true then raise exception 'finalization_not_idempotent'; end if;
  if (select count(*) from public.transaction_financial_entries
      where transaction_id='00000000-0000-4000-8000-000000000077') <> 2
  then raise exception 'duplicate_financial_entries'; end if;
  if (select count(*) from public.portal_removal_jobs
      where transaction_id='00000000-0000-4000-8000-000000000077') <> 1
  then raise exception 'duplicate_removal_jobs'; end if;

  select * into claimed from public.crm_claim_portal_removal_jobs(
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000077',
    null,5
  );
  if claimed.id is null or claimed.attempts <> 1 then raise exception 'removal_not_claimed'; end if;
  finish_status := public.crm_finish_portal_removal_job(
    '00000000-0000-4000-8000-000000000011',claimed.id,false,'Synthetic portal failure',now()
  );
  if finish_status <> 'retry' then raise exception 'removal_retry_not_recorded'; end if;

  select * into claimed from public.crm_claim_portal_removal_jobs(
    '00000000-0000-4000-8000-000000000011',
    '00000000-0000-4000-8000-000000000077',
    null,5
  );
  if claimed.id is null or claimed.attempts <> 2 then raise exception 'removal_retry_not_claimed'; end if;
  finish_status := public.crm_finish_portal_removal_job(
    '00000000-0000-4000-8000-000000000011',claimed.id,true,null,null
  );
  if finish_status <> 'confirmed' then raise exception 'removal_not_confirmed'; end if;
  if (select status from public.portal_listings
      where id='00000000-0000-4000-8000-000000000088') <> 'deleted'
  then raise exception 'listing_not_deleted_after_confirmation'; end if;

  begin
    perform public.crm_finalize_transaction(
      '00000000-0000-4000-8000-000000000098',
      '00000000-0000-4000-8000-000000000077',
      '00000000-0000-4000-8000-000000000099'
    );
    raise exception 'cross_agency_finalization_was_allowed';
  exception when others then
    if sqlerrm='cross_agency_finalization_was_allowed' then raise; end if;
  end;
end $$;

select 'phase22_db_integration_ok' as result;

rollback;
