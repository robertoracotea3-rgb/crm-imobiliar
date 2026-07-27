\set ON_ERROR_STOP on

begin;

insert into auth.users(id,email) values
  ('32000000-0000-4000-8000-000000000001','owner32@example.invalid'),
  ('32000000-0000-4000-8000-000000000002','agent32@example.invalid'),
  ('32000000-0000-4000-8000-000000000003','other32@example.invalid');
insert into public.agencies(id,name) values
  ('32000000-0000-4000-8000-000000000010','Agency 32'),
  ('32000000-0000-4000-8000-000000000011','Other agency 32');
insert into public.profiles(user_id,agency_id,role,full_name,status) values
  ('32000000-0000-4000-8000-000000000001','32000000-0000-4000-8000-000000000010','owner','Owner 32','active'),
  ('32000000-0000-4000-8000-000000000002','32000000-0000-4000-8000-000000000010','agent','Agent 32','active'),
  ('32000000-0000-4000-8000-000000000003','32000000-0000-4000-8000-000000000011','owner','Other 32','active');

insert into public.contacts(id,agency_id,full_name,phone,agent_id) values
  ('32000000-0000-4000-8000-000000000020','32000000-0000-4000-8000-000000000010','Client cu vizionare','0700003220','32000000-0000-4000-8000-000000000002'),
  ('32000000-0000-4000-8000-000000000021','32000000-0000-4000-8000-000000000010','Client inactiv','0700003221','32000000-0000-4000-8000-000000000002'),
  ('32000000-0000-4000-8000-000000000022','32000000-0000-4000-8000-000000000010','Client prelungit','0700003222','32000000-0000-4000-8000-000000000002');

insert into public.demands(
  id,agency_id,contact_id,agent_id,status,created_at,updated_at,
  last_relevant_activity_at,review_due_at,property_types
) values
  (
    '32000000-0000-4000-8000-000000000030',
    '32000000-0000-4000-8000-000000000010',
    '32000000-0000-4000-8000-000000000020',
    '32000000-0000-4000-8000-000000000002',
    'activa',
    now()-interval '30 days',
    now()-interval '30 days',
    now()-interval '30 days',
    now()-interval '10 days',
    array['apartament']::text[]
  ),
  (
    '32000000-0000-4000-8000-000000000031',
    '32000000-0000-4000-8000-000000000010',
    '32000000-0000-4000-8000-000000000021',
    '32000000-0000-4000-8000-000000000002',
    'activa',
    now()-interval '30 days',
    now()-interval '30 days',
    now()-interval '30 days',
    now()-interval '10 days',
    array['apartament']::text[]
  ),
  (
    '32000000-0000-4000-8000-000000000032',
    '32000000-0000-4000-8000-000000000010',
    '32000000-0000-4000-8000-000000000022',
    '32000000-0000-4000-8000-000000000002',
    'inactiva',
    now()-interval '30 days',
    now()-interval '30 days',
    now()-interval '30 days',
    now()-interval '10 days',
    array['apartament']::text[]
  );

insert into public.calendar_events(
  id,agency_id,created_by,agent_id,contact_id,demand_id,type,title,
  start_at,status,completed
) values (
  '32000000-0000-4000-8000-000000000040',
  '32000000-0000-4000-8000-000000000010',
  '32000000-0000-4000-8000-000000000002',
  '32000000-0000-4000-8000-000000000002',
  '32000000-0000-4000-8000-000000000020',
  '32000000-0000-4000-8000-000000000030',
  'vizionare',
  'Vizionare viitoare',
  now()+interval '2 days',
  'programata',
  false
);

do $test$
declare
  sweep jsonb;
  closed jsonb;
  extended jsonb;
begin
  sweep := public.crm_mark_demands_for_review(
    now(),
    '32000000-0000-4000-8000-000000000010',
    20
  );
  if sweep->>'marked_for_review' <> '2' then
    raise exception 'unexpected_review_count:%', sweep;
  end if;
  if (select status from public.demands
      where id='32000000-0000-4000-8000-000000000030') <> 'activa' then
    raise exception 'future_viewing_demand_was_marked_for_closure';
  end if;
  if not exists (
    select 1 from public.demands
    where id='32000000-0000-4000-8000-000000000031'
      and status='de_verificat_inchidere'
      and review_marked_at is not null
      and deleted_at is null
  ) then
    raise exception 'inactive_demand_was_not_marked_for_review';
  end if;

  begin
    update public.demands
    set status='inchisa'
    where id='32000000-0000-4000-8000-000000000031';
    raise exception 'direct_demand_closure_was_allowed';
  exception when others then
    if sqlerrm='direct_demand_closure_was_allowed' then raise; end if;
  end;

  closed := public.crm_review_demand(
    '32000000-0000-4000-8000-000000000010',
    '32000000-0000-4000-8000-000000000002',
    '32000000-0000-4000-8000-000000000031',
    'close',
    'nu_mai_este_interesat',
    'Clientul a confirmat că nu mai caută.',
    null,
    null,
    'phase32-close'
  );
  if closed->>'status' <> 'inchisa'
     or not exists (
       select 1 from public.demands
       where id='32000000-0000-4000-8000-000000000031'
         and status='inchisa'
         and close_reason_code='nu_mai_este_interesat'
         and closed_at is not null
         and deleted_at is null
     ) then
    raise exception 'reviewed_demand_was_not_closed:%', closed;
  end if;

  extended := public.crm_review_demand(
    '32000000-0000-4000-8000-000000000010',
    '32000000-0000-4000-8000-000000000002',
    '32000000-0000-4000-8000-000000000032',
    'extend',
    null,
    'Clientul dorește să revenim săptămâna viitoare.',
    'follow_up',
    now()+interval '7 days',
    'phase32-extend'
  );
  if extended->>'status' <> 'activa'
     or not exists (
       select 1 from public.demands
       where id='32000000-0000-4000-8000-000000000032'
         and status='activa'
         and contact_after_at > now()
         and next_action_at > now()
         and review_marked_at is null
     ) then
    raise exception 'reviewed_demand_was_not_extended:%', extended;
  end if;

  begin
    perform public.crm_review_demand(
      '32000000-0000-4000-8000-000000000011',
      '32000000-0000-4000-8000-000000000002',
      '32000000-0000-4000-8000-000000000031',
      'reopen',
      null,
      'Încercare între agenții.',
      'follow_up',
      now()+interval '1 day',
      'phase32-cross-agency'
    );
    raise exception 'cross_agency_demand_review_was_allowed';
  exception when others then
    if sqlerrm='cross_agency_demand_review_was_allowed' then raise; end if;
  end;

  if not exists (
    select 1 from public.demand_review_events
    where demand_id='32000000-0000-4000-8000-000000000031'
      and event_type='closed'
      and reason_code='nu_mai_este_interesat'
  ) then
    raise exception 'demand_closure_history_is_missing';
  end if;
end
$test$;

select 'phase32_demand_review_ok' as result;

rollback;
