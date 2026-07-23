do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;
drop schema if exists public cascade;
drop schema if exists auth cascade;
create schema public;
create schema auth;

create table auth.users(id uuid primary key);
create table public.agencies(id uuid primary key);
create table public.profiles(
  user_id uuid primary key references auth.users(id),
  agency_id uuid not null references public.agencies(id),
  full_name text,role text,status text default 'active'
);
create table public.leads(
  id uuid primary key,
  agency_id uuid not null references public.agencies(id),
  agent_id uuid,assigned_to uuid,status text,pipeline_stage text,
  received_at timestamptz,first_response_at timestamptz,last_contacted_at timestamptz,
  next_action_at timestamptz,source text,source_normalized text,deleted_at timestamptz
);
create table public.properties(
  id uuid primary key,agency_id uuid not null references public.agencies(id),
  agent_id uuid,status text,deleted_at timestamptz
);
create table public.calendar_events(
  id uuid primary key,agency_id uuid not null references public.agencies(id),
  agent_id uuid,type text,status text,start_at timestamptz,deleted_at timestamptz
);
create table public.transactions(
  id uuid primary key,agency_id uuid not null references public.agencies(id),
  agent_id uuid,status text,completed_at timestamptz,created_at timestamptz,
  agency_commission numeric,agent_commission numeric,currency text,deleted_at timestamptz
);
create table public.tasks(
  id uuid primary key,agency_id uuid not null references public.agencies(id),
  assigned_to uuid,title text,status text,due_at timestamptz,deleted_at timestamptz
);
create table public.portal_listings(
  id uuid primary key,agency_id uuid not null references public.agencies(id),
  property_id uuid references public.properties(id),portal text,status text,
  remote_exists boolean,error_message text
);
create table public.lead_pipeline_events(
  id uuid primary key,agency_id uuid not null references public.agencies(id),
  lead_id uuid references public.leads(id),to_stage text,created_at timestamptz
);
create table public.transaction_financial_entries(
  id uuid primary key,agency_id uuid not null references public.agencies(id),
  transaction_id uuid references public.transactions(id),entry_type text,
  beneficiary_user_id uuid,amount numeric,currency text,status text,recorded_at timestamptz
);

insert into public.agencies values
  ('10000000-0000-0000-0000-000000000001'),
  ('20000000-0000-0000-0000-000000000001');
insert into auth.users values
  ('11000000-0000-0000-0000-000000000001'),
  ('11000000-0000-0000-0000-000000000002'),
  ('22000000-0000-0000-0000-000000000001');
insert into public.profiles values
  ('11000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','Owner A','owner','active'),
  ('11000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','Agent A','agent','active'),
  ('22000000-0000-0000-0000-000000000001','20000000-0000-0000-0000-000000000001','Owner B','owner','active');

insert into public.leads values
  ('30000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001',
   '11000000-0000-0000-0000-000000000002',null,'won','finalizat',
   now()-interval '1 day',now()-interval '23 hours 30 minutes',null,null,'storia','storia',null),
  ('30000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001',
   '11000000-0000-0000-0000-000000000002',null,'new','lead_nou',
   now()-interval '2 days',null,null,null,'site','site',null),
  ('30000000-0000-0000-0000-000000000003','10000000-0000-0000-0000-000000000001',
   '11000000-0000-0000-0000-000000000001',null,'contacted','contactat',
   now()-interval '3 days',now()-interval '2 days 23 hours',null,now()+interval '1 day','manual','manual',null),
  ('30000000-0000-0000-0000-000000000004','20000000-0000-0000-0000-000000000001',
   '22000000-0000-0000-0000-000000000001',null,'won','finalizat',
   now()-interval '1 day',now()-interval '23 hours',null,null,'storia','storia',null);

insert into public.properties values
  ('40000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002','activa',null),
  ('40000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','expirata',null),
  ('40000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','22000000-0000-0000-0000-000000000001','activa',null);
insert into public.calendar_events values
  ('50000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002','vizionare','efectuata',now()-interval '1 day',null);
insert into public.lead_pipeline_events values
  ('60000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','oferta',now()-interval '1 day'),
  ('60000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','30000000-0000-0000-0000-000000000001','rezervare',now()-interval '1 day');
insert into public.transactions values
  ('70000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002','finalizata',now()-interval '1 day',now()-interval '10 days',1000,300,'EUR',null),
  ('70000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002','negociere',null,now()-interval '2 days',2000,500,'EUR',null);
insert into public.transaction_financial_entries values
  ('71000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','agency_commission',null,1000,'EUR','recorded',now()-interval '1 day'),
  ('71000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','70000000-0000-0000-0000-000000000001','agent_commission','11000000-0000-0000-0000-000000000002',300,'EUR','recorded',now()-interval '1 day');
insert into public.tasks values
  ('80000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000002','Follow-up după vizionare','open',now()-interval '1 hour',null),
  ('80000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','11000000-0000-0000-0000-000000000001','Task owner','open',now()+interval '1 day',null);
insert into public.portal_listings values
  ('90000000-0000-0000-0000-000000000001','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000001','storia','active',true,null),
  ('90000000-0000-0000-0000-000000000002','10000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000002','storia','error',true,'Eroare'),
  ('90000000-0000-0000-0000-000000000003','20000000-0000-0000-0000-000000000001','40000000-0000-0000-0000-000000000003','storia','error',true,'Nu trebuie văzută');
