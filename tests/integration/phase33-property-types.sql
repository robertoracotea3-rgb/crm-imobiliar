\set ON_ERROR_STOP on

begin;

insert into auth.users(id,email) values
  ('33000000-0000-4000-8000-000000000001','owner33@example.invalid'),
  ('33000000-0000-4000-8000-000000000002','agent33@example.invalid');
insert into public.agencies(id,name) values
  ('33000000-0000-4000-8000-000000000010','Agency 33');
insert into public.profiles(user_id,agency_id,role,full_name,status) values
  ('33000000-0000-4000-8000-000000000001','33000000-0000-4000-8000-000000000010','owner','Owner 33','active'),
  ('33000000-0000-4000-8000-000000000002','33000000-0000-4000-8000-000000000010','agent','Agent 33','active');
insert into public.contacts(id,agency_id,full_name,phone,agent_id) values
  ('33000000-0000-4000-8000-000000000020','33000000-0000-4000-8000-000000000010','Client garsoniera','0700003320','33000000-0000-4000-8000-000000000002');

insert into public.properties(
  id,agency_id,agent_id,responsible_agent_id,internal_code,title,city,county,
  category,price,currency,attributes,status
) values (
  '33000000-0000-4000-8000-000000000030',
  '33000000-0000-4000-8000-000000000010',
  '33000000-0000-4000-8000-000000000002',
  '33000000-0000-4000-8000-000000000002',
  'GS-0033',
  'Garsoniera centrala',
  'Fagaras',
  'Brasov',
  'studio_apartment',
  42000,
  'EUR',
  '{"sup_utila":31,"nr_camere":1,"publicare":{"site":true,"storia":true}}',
  'activa'
);

insert into public.demands(
  id,agency_id,contact_id,agent_id,category,property_types,status
) values (
  '33000000-0000-4000-8000-000000000040',
  '33000000-0000-4000-8000-000000000010',
  '33000000-0000-4000-8000-000000000020',
  '33000000-0000-4000-8000-000000000002',
  'studio_apartment',
  array['studio_apartment'],
  'activa'
);

do $$
declare
  public_url text;
begin
  select public.crm_public_property_url(
    '33000000-0000-4000-8000-000000000030',
    'GS-0033',
    'studio_apartment',
    'Fagaras'
  ) into public_url;

  if public_url <> 'https://www.kiraimobiliare.ro/proprietati/garsoniera-fagaras-gs-0033' then
    raise exception 'Studio public URL mapping failed: %', public_url;
  end if;

  if not exists (
    select 1 from public.demands
    where id = '33000000-0000-4000-8000-000000000040'
      and property_types = array['studio_apartment']
  ) then
    raise exception 'Studio demand type was not persisted';
  end if;
end
$$;

rollback;

select 'phase33_property_types_ok';
