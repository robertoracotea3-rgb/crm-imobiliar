\set ON_ERROR_STOP on

begin;

insert into auth.users(id,email) values
  ('28000000-0000-4000-8000-000000000001','owner28@example.invalid'),
  ('28000000-0000-4000-8000-000000000002','agent28@example.invalid'),
  ('28000000-0000-4000-8000-000000000003','other28@example.invalid');
insert into public.agencies(id,name) values
  ('28000000-0000-4000-8000-000000000010','Agency 28'),
  ('28000000-0000-4000-8000-000000000011','Other Agency 28');
insert into public.profiles(user_id,agency_id,role,status) values
  ('28000000-0000-4000-8000-000000000001','28000000-0000-4000-8000-000000000010','owner','active'),
  ('28000000-0000-4000-8000-000000000002','28000000-0000-4000-8000-000000000010','agent','active'),
  ('28000000-0000-4000-8000-000000000003','28000000-0000-4000-8000-000000000011','agent','active');

insert into public.properties(
  id,agency_id,agent_id,internal_code,title,city,county,category,price,currency,status
) values (
  '28000000-0000-4000-8000-000000000020',
  '28000000-0000-4000-8000-000000000010',
  '28000000-0000-4000-8000-000000000002',
  'KIRA-280',
  'Apartament Storia 28',
  'Făgăraș',
  'Brașov',
  'apartament',
  88000,
  'EUR',
  'activa'
);
insert into public.property_photos(
  agency_id,property_id,public_url,storage_path,is_cover,sort_order
) values (
  '28000000-0000-4000-8000-000000000010',
  '28000000-0000-4000-8000-000000000020',
  'https://cdn.example.invalid/kira-280-cover.webp',
  'agency/property/cover.webp',
  true,
  0
);

insert into public.leads(
  id,agency_id,contact_name,property_id,source,source_normalized,
  association_status,received_at
) values (
  '28000000-0000-4000-8000-000000000030',
  '28000000-0000-4000-8000-000000000010',
  'Client Storia 28',
  '28000000-0000-4000-8000-000000000020',
  'storia',
  'storia',
  'linked',
  '2026-07-24T09:00:00Z'
);

do $test$
declare
  assigned timestamptz;
  deadline timestamptz;
begin
  if (
    select responsible_agent_id
    from public.leads
    where id = '28000000-0000-4000-8000-000000000030'
  ) <> '28000000-0000-4000-8000-000000000002' then
    raise exception 'storia_lead_was_not_assigned_to_property_agent';
  end if;
  if not exists (
    select 1
    from public.leads
    where id = '28000000-0000-4000-8000-000000000030'
      and agent_id = responsible_agent_id
      and lead_assignment_status = 'assigned'
      and property_title = 'Apartament Storia 28'
      and property_public_code = 'KIRA-280'
      and property_public_url =
        'https://www.kiraimobiliare.ro/proprietati/apartament-fagaras-kira-280'
      and property_main_photo_url = 'https://cdn.example.invalid/kira-280-cover.webp'
      and property_price = 88000
      and property_currency = 'EUR'
  ) then
    raise exception 'storia_lead_property_snapshot_is_incomplete';
  end if;

  select assigned_at,first_contact_due_at into assigned,deadline
  from public.leads
  where id = '28000000-0000-4000-8000-000000000030';
  if deadline - assigned <> interval '24 hours' then
    raise exception 'first_contact_deadline_is_not_24_hours';
  end if;

  update public.properties
  set title = 'Titlu schimbat după lead',
      price = 99000
  where id = '28000000-0000-4000-8000-000000000020';
  if not exists (
    select 1
    from public.leads
    where id = '28000000-0000-4000-8000-000000000030'
      and property_title = 'Apartament Storia 28'
      and property_price = 88000
  ) then
    raise exception 'lead_snapshot_changed_with_live_property';
  end if;

  begin
    insert into public.leads(
      id,agency_id,contact_name,property_id,source,source_normalized,association_status
    ) values (
      '28000000-0000-4000-8000-000000000031',
      '28000000-0000-4000-8000-000000000011',
      'Cross agency',
      '28000000-0000-4000-8000-000000000020',
      'storia',
      'storia',
      'linked'
    );
    raise exception 'cross_agency_lead_property_was_allowed';
  exception when others then
    if sqlerrm = 'cross_agency_lead_property_was_allowed' then raise; end if;
  end;
end
$test$;

insert into public.properties(
  id,agency_id,internal_code,title,city,category,status,assignment_reason
) values (
  '28000000-0000-4000-8000-000000000021',
  '28000000-0000-4000-8000-000000000010',
  'KIRA-281',
  'Proprietate fără agent',
  'Făgăraș',
  'apartament',
  'activa',
  'Așteaptă alocarea ownerului'
);
insert into public.leads(
  id,agency_id,contact_name,property_id,source,source_normalized,association_status
) values (
  '28000000-0000-4000-8000-000000000032',
  '28000000-0000-4000-8000-000000000010',
  'Client de alocat',
  '28000000-0000-4000-8000-000000000021',
  'storia',
  'storia',
  'linked'
);

do $test$
begin
  if not exists (
    select 1
    from public.leads
    where id = '28000000-0000-4000-8000-000000000032'
      and agent_id is null
      and responsible_agent_id is null
      and assigned_at is null
      and first_contact_due_at is null
      and lead_assignment_status = 'pending_owner'
  ) then
    raise exception 'unassigned_storia_lead_is_not_in_owner_queue';
  end if;
end
$test$;

select 'phase28_storia_lead_assignment_ok' as result;

rollback;
