\set ON_ERROR_STOP on

begin;

insert into auth.users(id,email) values
  ('29000000-0000-4000-8000-000000000001','owner29@example.invalid'),
  ('29000000-0000-4000-8000-000000000002','agent29@example.invalid');
insert into public.agencies(id,name) values
  ('29000000-0000-4000-8000-000000000010','Agency 29');
insert into public.profiles(user_id,agency_id,role,full_name,status) values
  ('29000000-0000-4000-8000-000000000001','29000000-0000-4000-8000-000000000010','owner','Owner 29','active'),
  ('29000000-0000-4000-8000-000000000002','29000000-0000-4000-8000-000000000010','agent','Agent 29','active');

insert into public.properties(
  id,agency_id,agent_id,internal_code,title,city,category,status
) values (
  '29000000-0000-4000-8000-000000000020',
  '29000000-0000-4000-8000-000000000010',
  '29000000-0000-4000-8000-000000000002',
  'KIRA-290',
  'Proprietate SLA',
  'Făgăraș',
  'apartament',
  'activa'
);

insert into public.leads(
  id,agency_id,contact_name,property_id,source,source_normalized,association_status,received_at
) values
  ('29000000-0000-4000-8000-000000000030','29000000-0000-4000-8000-000000000010','Lead 12h','29000000-0000-4000-8000-000000000020','storia','storia','linked','2026-07-24T10:00:00Z'),
  ('29000000-0000-4000-8000-000000000031','29000000-0000-4000-8000-000000000010','Lead 4h','29000000-0000-4000-8000-000000000020','storia','storia','linked','2026-07-24T10:00:00Z'),
  ('29000000-0000-4000-8000-000000000032','29000000-0000-4000-8000-000000000010','Lead restant','29000000-0000-4000-8000-000000000020','storia','storia','linked','2026-07-23T10:00:00Z'),
  ('29000000-0000-4000-8000-000000000033','29000000-0000-4000-8000-000000000010','Lead în termen','29000000-0000-4000-8000-000000000020','storia','storia','linked','2026-07-24T10:00:00Z'),
  ('29000000-0000-4000-8000-000000000034','29000000-0000-4000-8000-000000000010','Lead târziu','29000000-0000-4000-8000-000000000020','storia','storia','linked','2026-07-23T10:00:00Z');

update public.leads set
  assigned_at = '2026-07-24T10:00:00Z',
  first_contact_due_at = '2026-07-25T10:00:00Z',
  contact_sla_status = 'pending'
where id = '29000000-0000-4000-8000-000000000030';
update public.leads set
  assigned_at = '2026-07-24T18:00:00Z',
  first_contact_due_at = '2026-07-25T18:00:00Z',
  contact_sla_status = 'pending'
where id = '29000000-0000-4000-8000-000000000031';
update public.leads set
  assigned_at = '2026-07-23T10:00:00Z',
  first_contact_due_at = '2026-07-24T10:00:00Z',
  contact_sla_status = 'pending'
where id = '29000000-0000-4000-8000-000000000032';
update public.leads set
  assigned_at = '2026-07-24T10:00:00Z',
  first_contact_due_at = '2026-07-25T10:00:00Z',
  contact_sla_status = 'pending'
where id = '29000000-0000-4000-8000-000000000033';
update public.leads set first_response_at = '2026-07-24T12:00:00Z'
where id = '29000000-0000-4000-8000-000000000033';
update public.leads set
  assigned_at = '2026-07-23T10:00:00Z',
  first_contact_due_at = '2026-07-24T10:00:00Z',
  contact_sla_status = 'pending'
where id = '29000000-0000-4000-8000-000000000034';
update public.leads set first_response_at = '2026-07-24T12:00:00Z'
where id = '29000000-0000-4000-8000-000000000034';

do $test$
declare
  result jsonb;
  repeated jsonb;
  dashboard jsonb;
begin
  if not exists (
    select 1 from public.leads
    where id = '29000000-0000-4000-8000-000000000033'
      and first_successful_contact_at = '2026-07-24T12:00:00Z'
      and contact_sla_status = 'met'
  ) then
    raise exception 'on_time_contact_was_not_classified';
  end if;
  if not exists (
    select 1 from public.leads
    where id = '29000000-0000-4000-8000-000000000034'
      and first_successful_contact_at = '2026-07-24T12:00:00Z'
      and contact_sla_status = 'late'
  ) then
    raise exception 'late_contact_was_not_classified';
  end if;

  result := public.crm_process_contact_sla(
    '2026-07-25T07:00:00Z',
    '29000000-0000-4000-8000-000000000010'
  );
  if (result->>'notified_12h')::integer <> 1
     or (result->>'notified_4h')::integer <> 1
     or (result->>'notified_overdue')::integer <> 1
     or (result->>'notified_owner')::integer <> 1 then
    raise exception 'sla_notification_stages_are_wrong: %', result;
  end if;
  if (
    select contact_sla_status
    from public.leads
    where id = '29000000-0000-4000-8000-000000000032'
  ) <> 'overdue' then
    raise exception 'expired_lead_was_not_marked_overdue';
  end if;

  repeated := public.crm_process_contact_sla(
    '2026-07-25T07:05:00Z',
    '29000000-0000-4000-8000-000000000010'
  );
  if (repeated->>'notified_12h')::integer <> 0
     or (repeated->>'notified_4h')::integer <> 0
     or (repeated->>'notified_overdue')::integer <> 0
     or (repeated->>'notified_owner')::integer <> 0 then
    raise exception 'sla_notifications_were_duplicated: %', repeated;
  end if;

  dashboard := public.crm_contact_sla_dashboard(
    '29000000-0000-4000-8000-000000000010',
    '29000000-0000-4000-8000-000000000001',
    true,
    '2026-07-23T00:00:00Z',
    '2026-07-26T00:00:00Z'
  );
  if jsonb_array_length(dashboard->'agents') <> 2
     or (dashboard->'overall'->>'contacted_on_time')::integer <> 1
     or (dashboard->'overall'->>'contacted_late')::integer <> 1 then
    raise exception 'sla_dashboard_is_wrong: %', dashboard;
  end if;
end
$test$;

update public.leads
set responsible_agent_id = '29000000-0000-4000-8000-000000000001'
where id = '29000000-0000-4000-8000-000000000030';

do $test$
begin
  if not exists (
    select 1
    from public.leads
    where id = '29000000-0000-4000-8000-000000000030'
      and agent_id = '29000000-0000-4000-8000-000000000001'
      and responsible_agent_id = '29000000-0000-4000-8000-000000000001'
      and first_contact_due_at - assigned_at = interval '24 hours'
      and contact_sla_status = 'pending'
  ) then
    raise exception 'lead_reassignment_did_not_restart_pending_sla';
  end if;
end
$test$;

select 'phase29_contact_sla_ok' as result;

rollback;
