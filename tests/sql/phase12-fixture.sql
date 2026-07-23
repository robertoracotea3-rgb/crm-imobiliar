create extension if not exists pgcrypto;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;
grant usage on schema public,auth to anon,authenticated,service_role;

create table auth.users(id uuid primary key);
create or replace function auth.uid() returns uuid language sql stable as $$
 select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid
$$;
create table public.agencies(id uuid primary key,name text);
create table public.profiles(
  user_id uuid primary key references auth.users(id),agency_id uuid references public.agencies(id),
  role text,status text default 'active'
);
create or replace function public.current_crm_agency_id() returns uuid language sql stable security definer
set search_path=public,auth as $$ select agency_id from public.profiles where user_id=auth.uid() limit 1 $$;
create or replace function public.crm_has_permission(p_module text,p_action text) returns boolean language sql stable
as $$ select true $$;
create or replace function public.crm_enqueue_notification(
  p_agency_id uuid,p_user_id uuid,p_type text,p_title text,p_message text,p_entity_type text,
  p_entity_id text,p_priority text,p_action_url text,p_dedup_key text,p_metadata jsonb default '{}'::jsonb
) returns integer language sql as $$ select 1 $$;

create table public.leads(
 id uuid primary key,agency_id uuid references public.agencies(id),deleted_at timestamptz
);
create table public.contacts(
 id uuid primary key,agency_id uuid references public.agencies(id),full_name text,phone text,
 merge_status text default 'active',deleted_at timestamptz
);
create table public.properties(
 id uuid primary key,agency_id uuid references public.agencies(id),agent_id uuid references auth.users(id),
 internal_code text,title text,status text,deleted_at timestamptz,updated_at timestamptz default now()
);
create table public.transactions(
 id uuid primary key default gen_random_uuid(),agency_id uuid references public.agencies(id),
 property_id uuid references public.properties(id),agent_id uuid references auth.users(id),
 contact_id uuid references public.contacts(id),type text default 'vanzare',status text default 'draft',
 status_reason text,sale_price numeric default 0,currency text default 'EUR',
 agency_commission numeric default 0,agent_commission numeric default 0,closed_at date,notes text,
 created_by uuid references auth.users(id),created_at timestamptz default now(),
 deleted_at timestamptz,deleted_by uuid references auth.users(id)
);
create table public.portal_listings(
 id uuid primary key,agency_id uuid references public.agencies(id),property_id uuid references public.properties(id),
 portal text,external_id text,status text,error_message text,last_sync_at timestamptz,updated_at timestamptz default now()
);
create table public.activity_logs(
 id uuid primary key default gen_random_uuid(),agency_id uuid,entity_type text,entity_id uuid,user_id uuid,
 action text,field text,old_value text,new_value text,created_at timestamptz default now()
);
create table public.transaction_statuses(
 code text primary key,display_name text,display_order integer,category text,ui_color text,
 is_active boolean,is_terminal boolean,requires_next_action boolean
);
create table public.property_statuses(
 code text primary key,display_name text,display_order integer,category text,ui_color text,
 is_active boolean,is_terminal boolean,requires_next_action boolean
);
create table public.crm_status_transitions(
 entity_type text,from_code text,to_code text,is_active boolean not null default true,
 primary key(entity_type,from_code,to_code)
);
insert into public.transaction_statuses values
 ('draft','Draft',10,'open','gray',true,false,false),
 ('negociere','Negociere',20,'open','orange',true,false,false),
 ('rezervata','Rezervată',30,'closing','blue',true,false,false),
 ('antecontract','Antecontract',40,'closing','yellow',true,false,false),
 ('finalizata','Finalizată',50,'closed','emerald',true,true,false),
 ('anulata','Anulată',60,'cancelled','red',true,true,false);
insert into public.property_statuses values
 ('activa','Activă',10,'active','emerald',true,false,false),
 ('rezervata','Rezervată',20,'closing','blue',true,false,false),
 ('tranzactionata','Tranzacționată',30,'closed','violet',true,true,false),
 ('inchiriata','Închiriată',40,'closed','indigo',true,true,false);
insert into public.crm_status_transitions(entity_type,from_code,to_code) values
 ('transaction','draft','finalizata'),('transaction','draft','anulata'),
 ('property','activa','tranzactionata'),('property','activa','inchiriata'),
 ('property','rezervata','tranzactionata'),('property','rezervata','inchiriata');
create or replace function public.test_status_transition() returns trigger language plpgsql as $$
begin
 if tg_op='UPDATE' and new.status is distinct from old.status and not exists(
  select 1 from public.crm_status_transitions where entity_type=tg_argv[0]
   and from_code=old.status and to_code=new.status and is_active
 ) then raise exception 'invalid transaction transition'; end if;
 return new;
end $$;
create trigger enforce_transaction_status_transition before update of status on public.transactions
for each row execute function public.test_status_transition('transaction');
create trigger enforce_property_status_transition before update of status on public.properties
for each row execute function public.test_status_transition('property');

insert into public.agencies values
 ('10000000-0000-0000-0000-000000000001','Agency A'),
 ('20000000-0000-0000-0000-000000000002','Agency B');
insert into auth.users values
 ('aaaaaaaa-0000-0000-0000-000000000001'),
 ('bbbbbbbb-0000-0000-0000-000000000002');
insert into public.profiles values
 ('aaaaaaaa-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','agent','active'),
 ('bbbbbbbb-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','agent','active');
insert into public.contacts values
 ('31000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Client A','0722000001','active',null),
 ('32000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002','Client B','0722000002','active',null);
insert into public.properties values
 ('41000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001','KIRA-1','Apartament A','activa',null,now()),
 ('42000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',
  'bbbbbbbb-0000-0000-0000-000000000002','KIRA-B','Apartament B','activa',null,now());
insert into public.transactions(
 id,agency_id,property_id,agent_id,contact_id,type,status,sale_price,currency,agency_commission,agent_commission,created_by
) values
 ('51000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
  null,'aaaaaaaa-0000-0000-0000-000000000001',null,'vanzare','finalizata',100000,'EUR',2000,800,
  'aaaaaaaa-0000-0000-0000-000000000001'),
 ('51000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001',
  '31000000-0000-0000-0000-000000000001','vanzare','draft',95000,'EUR',1900,700,
  'aaaaaaaa-0000-0000-0000-000000000001'),
 ('52000000-0000-0000-0000-000000000002','20000000-0000-0000-0000-000000000002',
  '42000000-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002',
  '32000000-0000-0000-0000-000000000002','vanzare','draft',80000,'EUR',1600,600,
  'bbbbbbbb-0000-0000-0000-000000000002');
insert into public.portal_listings values
 ('61000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001','storia','storia-public-id','active',null,now(),now());
