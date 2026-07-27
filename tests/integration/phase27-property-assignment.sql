\set ON_ERROR_STOP on

begin;

insert into auth.users(id,email) values
  ('27000000-0000-4000-8000-000000000001','owner27@example.invalid'),
  ('27000000-0000-4000-8000-000000000002','agent-a27@example.invalid'),
  ('27000000-0000-4000-8000-000000000003','agent-b27@example.invalid'),
  ('27000000-0000-4000-8000-000000000004','other27@example.invalid');
insert into public.agencies(id,name) values
  ('27000000-0000-4000-8000-000000000010','Agency 27'),
  ('27000000-0000-4000-8000-000000000011','Other Agency 27');
insert into public.profiles(user_id,agency_id,role,status) values
  ('27000000-0000-4000-8000-000000000001','27000000-0000-4000-8000-000000000010','owner','active'),
  ('27000000-0000-4000-8000-000000000002','27000000-0000-4000-8000-000000000010','agent','active'),
  ('27000000-0000-4000-8000-000000000003','27000000-0000-4000-8000-000000000010','agent','active'),
  ('27000000-0000-4000-8000-000000000004','27000000-0000-4000-8000-000000000011','agent','active');

select set_config(
  'request.jwt.claims',
  '{"sub":"27000000-0000-4000-8000-000000000001"}',
  true
);

insert into public.properties(id,agency_id,agent_id,internal_code,title,status) values (
  '27000000-0000-4000-8000-000000000020',
  '27000000-0000-4000-8000-000000000010',
  '27000000-0000-4000-8000-000000000002',
  'KIRA-27',
  'Property assignment 27',
  'activa'
);
insert into public.leads(
  id,agency_id,contact_name,agent_id,status,property_id
) values (
  '27000000-0000-4000-8000-000000000030',
  '27000000-0000-4000-8000-000000000010',
  'Client assignment 27',
  '27000000-0000-4000-8000-000000000002',
  'new',
  '27000000-0000-4000-8000-000000000020'
);
insert into public.tasks(
  id,agency_id,assigned_to,title,status,due_at,property_id
) values (
  '27000000-0000-4000-8000-000000000040',
  '27000000-0000-4000-8000-000000000010',
  '27000000-0000-4000-8000-000000000002',
  'Task assignment 27',
  'pending',
  now() + interval '1 day',
  '27000000-0000-4000-8000-000000000020'
);
insert into public.calendar_events(
  id,agency_id,type,title,start_at,property_id,agent_id,status
) values (
  '27000000-0000-4000-8000-000000000050',
  '27000000-0000-4000-8000-000000000010',
  'viewing',
  'Viewing assignment 27',
  now() + interval '1 day',
  '27000000-0000-4000-8000-000000000020',
  '27000000-0000-4000-8000-000000000002',
  'programata'
);
insert into public.demands(
  id,agency_id,agent_id,status,property_types
) values (
  '27000000-0000-4000-8000-000000000060',
  '27000000-0000-4000-8000-000000000010',
  '27000000-0000-4000-8000-000000000002',
  'activa',
  array['apartament']::text[]
);
insert into public.matches(
  id,agency_id,demand_id,property_id,score
) values (
  '27000000-0000-4000-8000-000000000070',
  '27000000-0000-4000-8000-000000000010',
  '27000000-0000-4000-8000-000000000060',
  '27000000-0000-4000-8000-000000000020',
  85
);

do $test$
declare
  result jsonb;
begin
  if (
    select responsible_agent_id
    from public.properties
    where id = '27000000-0000-4000-8000-000000000020'
  ) <> '27000000-0000-4000-8000-000000000002' then
    raise exception 'legacy_agent_was_not_synchronized';
  end if;

  result := public.crm_assign_properties(
    '27000000-0000-4000-8000-000000000010',
    '27000000-0000-4000-8000-000000000001',
    array['27000000-0000-4000-8000-000000000020'::uuid],
    '27000000-0000-4000-8000-000000000003',
    'Agent disponibil pentru zonă',
    true, true, true, true, false
  );
  if (result->>'changed')::integer <> 1
     or (result->>'active_leads_reassigned')::integer <> 1
     or (result->>'open_tasks_reassigned')::integer <> 1
     or (result->>'future_viewings_reassigned')::integer <> 1
     or (result->>'active_demands_reassigned')::integer <> 1 then
    raise exception 'assignment_counts_are_wrong: %', result;
  end if;
  if (
    select responsible_agent_id = '27000000-0000-4000-8000-000000000003'
       and agent_id = '27000000-0000-4000-8000-000000000003'
    from public.properties
    where id = '27000000-0000-4000-8000-000000000020'
  ) is not true then
    raise exception 'property_assignment_not_synchronized';
  end if;
  if not exists (
    select 1 from public.property_assignment_history
    where property_id = '27000000-0000-4000-8000-000000000020'
      and previous_agent_id = '27000000-0000-4000-8000-000000000002'
      and responsible_agent_id = '27000000-0000-4000-8000-000000000003'
      and cascade_options->>'reassign_active_leads' = 'true'
  ) then
    raise exception 'assignment_history_missing';
  end if;

  begin
    perform public.crm_assign_properties(
      '27000000-0000-4000-8000-000000000010',
      '27000000-0000-4000-8000-000000000001',
      array['27000000-0000-4000-8000-000000000020'::uuid],
      '27000000-0000-4000-8000-000000000004',
      'Cross agency',
      false, false, false, false, false
    );
    raise exception 'cross_agency_assignment_was_allowed';
  exception when others then
    if sqlerrm = 'cross_agency_assignment_was_allowed' then raise; end if;
  end;
end
$test$;

select 'phase27_property_assignment_ok' as result;

rollback;
