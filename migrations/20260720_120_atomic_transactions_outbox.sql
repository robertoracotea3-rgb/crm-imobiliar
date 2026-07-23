begin;

create extension if not exists pg_trgm;

alter table public.transactions add column if not exists lead_id uuid references public.leads(id) on delete set null;
alter table public.transactions add column if not exists legacy_import boolean not null default false;
alter table public.transactions add column if not exists legacy_import_reason text;
alter table public.transactions add column if not exists property_code_snapshot text;
alter table public.transactions add column if not exists property_title_snapshot text;
alter table public.transactions add column if not exists contact_name_snapshot text;
alter table public.transactions add column if not exists contact_phone_snapshot text;
alter table public.transactions add column if not exists search_text text not null default '';
alter table public.transactions add column if not exists completed_at timestamptz;
alter table public.transactions add column if not exists cancelled_at timestamptz;
alter table public.transactions add column if not exists updated_at timestamptz not null default now();

alter table public.portal_listings add column if not exists removal_requested_at timestamptz;
alter table public.portal_listings add column if not exists removal_confirmed_at timestamptz;

create table if not exists public.transaction_financial_entries (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  entry_type text not null check(entry_type in ('agency_commission','agent_commission')),
  beneficiary_user_id uuid references auth.users(id),
  amount numeric(14,2) not null check(amount >= 0),
  currency text not null check(currency in ('EUR','RON')),
  status text not null default 'recorded' check(status in ('recorded','paid','cancelled')),
  recorded_at timestamptz not null default now(),
  paid_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(transaction_id,entry_type)
);

create table if not exists public.portal_removal_jobs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  portal_listing_id uuid not null references public.portal_listings(id) on delete restrict,
  portal text not null,
  external_id text,
  previous_listing_status text,
  status text not null default 'pending' check(status in ('pending','processing','retry','confirmed','failed')),
  attempts integer not null default 0 check(attempts >= 0),
  max_attempts integer not null default 8 check(max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  last_error text,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  confirmed_at timestamptz,
  updated_at timestamptz not null default now(),
  unique(transaction_id,portal_listing_id)
);

create table if not exists public.transaction_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  transaction_id uuid not null references public.transactions(id) on delete restrict,
  event_type text not null,
  actor_id uuid references auth.users(id),
  details jsonb not null default '{}'::jsonb,
  dedup_key text,
  created_at timestamptz not null default now(),
  unique(agency_id,transaction_id,dedup_key)
);

create index if not exists transactions_page_idx
  on public.transactions(agency_id,status,updated_at desc) where deleted_at is null;
create index if not exists transactions_search_idx
  on public.transactions using gin(search_text gin_trgm_ops) where deleted_at is null;
create index if not exists transaction_financial_entries_agency_idx
  on public.transaction_financial_entries(agency_id,recorded_at desc);
create index if not exists portal_removal_jobs_due_idx
  on public.portal_removal_jobs(agency_id,next_attempt_at) where status in ('pending','retry');
create index if not exists portal_removal_jobs_transaction_idx
  on public.portal_removal_jobs(transaction_id,requested_at desc);
create index if not exists transaction_events_transaction_idx
  on public.transaction_events(transaction_id,created_at desc);

-- Existing incomplete rows are retained as explicit historical imports. No
-- missing client or property is guessed.
update public.transactions
set legacy_import=true,
    legacy_import_reason=coalesce(legacy_import_reason,'Import istoric incomplet; legăturile originale nu pot fi reconstruite sigur.')
where property_id is null or contact_id is null or agent_id is null or coalesce(sale_price,0)<=0;

create or replace function public.crm_validate_and_snapshot_transaction()
returns trigger language plpgsql security definer set search_path=public,pg_temp as $$
declare property_row record; contact_row record;
begin
  if new.legacy_import and (tg_op='INSERT' or not coalesce(old.legacy_import,false)) then
    raise exception 'transaction_legacy_flag_server_only';
  end if;
  if not new.legacy_import and (
    new.property_id is null or new.contact_id is null or new.agent_id is null or coalesce(new.sale_price,0)<=0
  ) then raise exception 'transaction_required_links_missing'; end if;
  if new.type not in ('vanzare','inchiriere') then raise exception 'transaction_type_invalid'; end if;
  if new.currency not in ('EUR','RON') then raise exception 'transaction_currency_invalid'; end if;
  if coalesce(new.agency_commission,0)<0 or coalesce(new.agent_commission,0)<0 then
    raise exception 'transaction_commission_negative';
  end if;
  if new.property_id is not null then
    select id,internal_code,title into property_row from public.properties
    where id=new.property_id and agency_id=new.agency_id and deleted_at is null;
    if not found then raise exception 'transaction_property_not_in_agency'; end if;
    new.property_code_snapshot := property_row.internal_code;
    new.property_title_snapshot := property_row.title;
  end if;
  if new.contact_id is not null then
    select id,full_name,phone into contact_row from public.contacts
    where id=new.contact_id and agency_id=new.agency_id and deleted_at is null
      and coalesce(merge_status,'active')='active';
    if not found then raise exception 'transaction_contact_not_in_agency'; end if;
    new.contact_name_snapshot := contact_row.full_name;
    new.contact_phone_snapshot := contact_row.phone;
  end if;
  if new.agent_id is not null and not exists(
    select 1 from public.profiles where user_id=new.agent_id and agency_id=new.agency_id
      and coalesce(status,'active')='active'
  ) then raise exception 'transaction_agent_not_in_agency'; end if;
  if new.lead_id is not null and not exists(
    select 1 from public.leads where id=new.lead_id and agency_id=new.agency_id and deleted_at is null
  ) then raise exception 'transaction_lead_not_in_agency'; end if;
  new.search_text := lower(concat_ws(' ',new.property_code_snapshot,new.property_title_snapshot,
    new.contact_name_snapshot,new.contact_phone_snapshot,new.type,new.status));
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists crm_validate_transaction_trigger on public.transactions;
create trigger crm_validate_transaction_trigger before insert or update of
  agency_id,property_id,contact_id,agent_id,lead_id,type,currency,sale_price,
  agency_commission,agent_commission,status,legacy_import
on public.transactions for each row execute function public.crm_validate_and_snapshot_transaction();

-- Populate search snapshots on historical rows while preserving their values.
update public.transactions set status=status;

alter table public.transactions drop constraint if exists transactions_required_links_check;
alter table public.transactions add constraint transactions_required_links_check check(
  legacy_import or (
    property_id is not null and contact_id is not null and agent_id is not null
    and sale_price is not null and sale_price>0
  )
) not valid;
alter table public.transactions validate constraint transactions_required_links_check;
alter table public.transactions drop constraint if exists transactions_money_check;
alter table public.transactions add constraint transactions_money_check check(
  coalesce(sale_price,0)>=0 and coalesce(agency_commission,0)>=0 and coalesce(agent_commission,0)>=0
) not valid;
alter table public.transactions validate constraint transactions_money_check;

insert into public.transaction_statuses values
  ('oferta','Ofertă',20,'open','sky',true,false,false),
  ('negociere','Negociere',30,'open','orange',true,false,false),
  ('rezervata','Rezervată',40,'closing','blue',true,false,false),
  ('antecontract','Antecontract',50,'closing','yellow',true,false,false),
  ('finantare','Finanțare',60,'closing','indigo',true,false,false),
  ('notar','Notar',70,'closing','violet',true,false,false),
  ('finalizata','Finalizată',80,'closed','emerald',true,true,false),
  ('anulata','Anulată',90,'cancelled','red',true,true,false)
on conflict(code) do update set display_name=excluded.display_name,display_order=excluded.display_order,
  category=excluded.category,ui_color=excluded.ui_color,is_active=excluded.is_active,
  is_terminal=excluded.is_terminal,requires_next_action=excluded.requires_next_action;

delete from public.crm_status_transitions where entity_type='transaction';
insert into public.crm_status_transitions(entity_type,from_code,to_code) values
  ('transaction','draft','oferta'),('transaction','draft','negociere'),('transaction','draft','rezervata'),('transaction','draft','antecontract'),('transaction','draft','finantare'),('transaction','draft','notar'),('transaction','draft','finalizata'),('transaction','draft','anulata'),
  ('transaction','oferta','draft'),('transaction','oferta','negociere'),('transaction','oferta','rezervata'),('transaction','oferta','anulata'),
  ('transaction','negociere','draft'),('transaction','negociere','oferta'),('transaction','negociere','rezervata'),('transaction','negociere','antecontract'),('transaction','negociere','finantare'),('transaction','negociere','notar'),('transaction','negociere','finalizata'),('transaction','negociere','anulata'),
  ('transaction','rezervata','negociere'),('transaction','rezervata','antecontract'),('transaction','rezervata','finantare'),('transaction','rezervata','notar'),('transaction','rezervata','finalizata'),('transaction','rezervata','anulata'),
  ('transaction','antecontract','negociere'),('transaction','antecontract','rezervata'),('transaction','antecontract','finantare'),('transaction','antecontract','notar'),('transaction','antecontract','finalizata'),('transaction','antecontract','anulata'),
  ('transaction','finantare','antecontract'),('transaction','finantare','notar'),('transaction','finantare','finalizata'),('transaction','finantare','anulata'),
  ('transaction','notar','antecontract'),('transaction','notar','finantare'),('transaction','notar','finalizata'),('transaction','notar','anulata'),
  ('transaction','anulata','draft');

create or replace function public.crm_finalize_transaction(
  p_agency_id uuid,p_transaction_id uuid,p_actor_id uuid
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare tx public.transactions%rowtype; prop public.properties%rowtype; property_status text;
  was_final boolean; financial_count integer; removal_count integer;
begin
  if not exists(select 1 from public.profiles where user_id=p_actor_id and agency_id=p_agency_id
    and coalesce(status,'active')='active') then raise exception 'transaction_actor_not_in_agency'; end if;
  select * into tx from public.transactions where id=p_transaction_id and agency_id=p_agency_id
    and deleted_at is null for update;
  if not found then raise exception 'transaction_not_found'; end if;
  if tx.legacy_import or tx.property_id is null or tx.contact_id is null or tx.agent_id is null
    or coalesce(tx.sale_price,0)<=0 then raise exception 'transaction_cannot_finalize_incomplete'; end if;
  select * into prop from public.properties where id=tx.property_id and agency_id=p_agency_id
    and deleted_at is null for update;
  if not found then raise exception 'transaction_property_not_found'; end if;
  property_status := case when tx.type='inchiriere' then 'inchiriata' else 'tranzactionata' end;
  if prop.status not in ('activa','rezervata',property_status) then
    raise exception 'transaction_property_status_invalid:%',prop.status;
  end if;
  was_final := tx.status='finalizata';
  if not was_final then
    update public.transactions set status='finalizata',closed_at=coalesce(closed_at,current_date),
      completed_at=now(),cancelled_at=null,updated_at=now() where id=tx.id;
  end if;
  if prop.status<>property_status then
    update public.properties set status=property_status,updated_at=now() where id=prop.id;
  end if;
  if coalesce(tx.agency_commission,0)>0 then
    insert into public.transaction_financial_entries(
      agency_id,transaction_id,entry_type,amount,currency,created_by
    ) values(p_agency_id,tx.id,'agency_commission',tx.agency_commission,tx.currency,p_actor_id)
    on conflict(transaction_id,entry_type) do update set amount=excluded.amount,currency=excluded.currency,updated_at=now();
  end if;
  if coalesce(tx.agent_commission,0)>0 then
    insert into public.transaction_financial_entries(
      agency_id,transaction_id,entry_type,beneficiary_user_id,amount,currency,created_by
    ) values(p_agency_id,tx.id,'agent_commission',tx.agent_id,tx.agent_commission,tx.currency,p_actor_id)
    on conflict(transaction_id,entry_type) do update set beneficiary_user_id=excluded.beneficiary_user_id,
      amount=excluded.amount,currency=excluded.currency,updated_at=now();
  end if;
  insert into public.portal_removal_jobs(
    agency_id,transaction_id,property_id,portal_listing_id,portal,external_id,previous_listing_status
  )
  select p_agency_id,tx.id,tx.property_id,pl.id,pl.portal,pl.external_id,pl.status
  from public.portal_listings pl
  where pl.agency_id=p_agency_id and pl.property_id=tx.property_id
    and pl.status not in ('deleted','expired')
  on conflict(transaction_id,portal_listing_id) do nothing;
  update public.portal_listings pl set status='pending_removal',removal_requested_at=coalesce(removal_requested_at,now()),
    removal_confirmed_at=null,updated_at=now()
  where pl.agency_id=p_agency_id and exists(
    select 1 from public.portal_removal_jobs j where j.transaction_id=tx.id
      and j.portal_listing_id=pl.id and j.status in ('pending','processing','retry','failed')
  );
  insert into public.transaction_events(agency_id,transaction_id,event_type,actor_id,details,dedup_key)
  values(p_agency_id,tx.id,'finalized',p_actor_id,
    jsonb_build_object('property_id',tx.property_id,'property_status',property_status),
    'finalized:'||tx.id::text) on conflict(agency_id,transaction_id,dedup_key) do nothing;
  perform public.crm_enqueue_notification(
    p_agency_id,tx.agent_id,'transaction_completed','Tranzacție finalizată',
    concat(coalesce(tx.property_code_snapshot,'Proprietatea'),' a fost ',
      case when tx.type='inchiriere' then 'închiriată.' else 'tranzacționată.' end),
    'transaction',tx.id::text,'normal','/finance','transaction_completed:'||tx.id::text,
    jsonb_build_object('property_id',tx.property_id)
  );
  if not was_final then
    insert into public.activity_logs(agency_id,entity_type,entity_id,user_id,action,field,old_value,new_value)
    values(p_agency_id,'transaction',tx.id,p_actor_id,'finalize','status',tx.status,'finalizata');
  end if;
  select count(*) into financial_count from public.transaction_financial_entries where transaction_id=tx.id;
  select count(*) into removal_count from public.portal_removal_jobs where transaction_id=tx.id;
  return jsonb_build_object('transaction_id',tx.id,'already_finalized',was_final,
    'property_status',property_status,'financial_entries',financial_count,'removal_jobs',removal_count);
end $$;

create or replace function public.crm_claim_portal_removal_jobs(
  p_agency_id uuid,p_transaction_id uuid default null,p_job_id uuid default null,p_limit integer default 5
) returns table(
  id uuid,transaction_id uuid,property_id uuid,portal_listing_id uuid,portal text,
  external_id text,attempts integer,max_attempts integer
) language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return query
  with due as (
    select j.id from public.portal_removal_jobs j
    where j.agency_id=p_agency_id and (
      (j.status in ('pending','retry') and j.next_attempt_at<=now())
      or (j.status='processing' and j.started_at<now()-interval '15 minutes')
    )
      and (p_transaction_id is null or j.transaction_id=p_transaction_id)
      and (p_job_id is null or j.id=p_job_id)
    order by j.next_attempt_at,j.requested_at
    for update skip locked limit greatest(1,least(coalesce(p_limit,5),20))
  ), claimed as (
    update public.portal_removal_jobs j set status='processing',attempts=j.attempts+1,
      started_at=now(),updated_at=now()
    from due where j.id=due.id returning j.*
  )
  select c.id,c.transaction_id,c.property_id,c.portal_listing_id,c.portal,
    c.external_id,c.attempts,c.max_attempts from claimed c;
end $$;

create or replace function public.crm_finish_portal_removal_job(
  p_agency_id uuid,p_job_id uuid,p_success boolean,p_error text default null,p_retry_at timestamptz default null
) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.portal_removal_jobs%rowtype; next_status text;
begin
  select * into job from public.portal_removal_jobs where id=p_job_id and agency_id=p_agency_id for update;
  if not found then raise exception 'removal_job_not_found'; end if;
  if p_success then
    update public.portal_removal_jobs set status='confirmed',last_error=null,confirmed_at=now(),updated_at=now()
    where id=job.id;
    update public.portal_listings set status='deleted',error_message=null,last_sync_at=now(),
      removal_confirmed_at=now(),updated_at=now()
    where id=job.portal_listing_id and agency_id=p_agency_id;
    next_status := 'confirmed';
  else
    next_status := case when job.attempts>=job.max_attempts then 'failed' else 'retry' end;
    update public.portal_removal_jobs set status=next_status,last_error=left(coalesce(p_error,'Eroare necunoscută'),500),
      next_attempt_at=coalesce(p_retry_at,now()+interval '1 hour'),updated_at=now()
    where id=job.id;
    update public.portal_listings set status='removal_failed',
      error_message=left(coalesce(p_error,'Retragerea nu a fost confirmată.'),500),updated_at=now()
    where id=job.portal_listing_id and agency_id=p_agency_id;
  end if;
  insert into public.transaction_events(agency_id,transaction_id,event_type,details,dedup_key)
  values(p_agency_id,job.transaction_id,
    case when p_success then 'portal_removal_confirmed' else 'portal_removal_failed' end,
    jsonb_build_object('job_id',job.id,'portal',job.portal,'attempt',job.attempts,'status',next_status),
    'portal_removal:'||job.id::text||':'||job.attempts::text)
  on conflict(agency_id,transaction_id,dedup_key) do nothing;
  return next_status;
end $$;

alter table public.transaction_financial_entries enable row level security;
alter table public.portal_removal_jobs enable row level security;
alter table public.transaction_events enable row level security;
revoke all on public.transaction_financial_entries,public.portal_removal_jobs,public.transaction_events from public,anon,authenticated;
grant select on public.transaction_financial_entries,public.portal_removal_jobs,public.transaction_events to authenticated;

drop policy if exists crm_transaction_financial_read on public.transaction_financial_entries;
create policy crm_transaction_financial_read on public.transaction_financial_entries for select to authenticated using(
  agency_id=public.current_crm_agency_id() and public.crm_has_permission('finance','view_financial')
);
drop policy if exists crm_portal_removal_jobs_read on public.portal_removal_jobs;
create policy crm_portal_removal_jobs_read on public.portal_removal_jobs for select to authenticated using(
  agency_id=public.current_crm_agency_id()
  and (public.crm_has_permission('transactions','view') or public.crm_has_permission('portals','view'))
);
drop policy if exists crm_transaction_events_read on public.transaction_events;
create policy crm_transaction_events_read on public.transaction_events for select to authenticated using(
  agency_id=public.current_crm_agency_id() and public.crm_has_permission('transactions','view')
);

revoke all on function public.crm_validate_and_snapshot_transaction() from public,anon,authenticated;
revoke all on function public.crm_finalize_transaction(uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.crm_claim_portal_removal_jobs(uuid,uuid,uuid,integer) from public,anon,authenticated;
revoke all on function public.crm_finish_portal_removal_job(uuid,uuid,boolean,text,timestamptz) from public,anon,authenticated;
grant execute on function public.crm_finalize_transaction(uuid,uuid,uuid) to service_role;
grant execute on function public.crm_claim_portal_removal_jobs(uuid,uuid,uuid,integer) to service_role;
grant execute on function public.crm_finish_portal_removal_job(uuid,uuid,boolean,text,timestamptz) to service_role;

commit;
