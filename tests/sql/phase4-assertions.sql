create temporary table phase4_result as
select public.create_crm_viewing(
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  null,
  '20000000-0000-4000-8000-000000000001',
  null,
  now() + interval '2 days',
  60,
  'Locație test',
  'Observații test',
  '["Client", "Agent"]'::jsonb,
  now() + interval '1 day'
) as viewing_id;

do $$
declare viewing_id uuid := (select phase4_result.viewing_id from phase4_result);
begin
  if not exists (
    select 1 from public.calendar_events
    where id = viewing_id and type = 'vizionare' and status = 'programata'
      and lead_id = '90000000-0000-4000-8000-000000000001'
      and property_id = '20000000-0000-4000-8000-000000000001'
      and agent_id = '30000000-0000-4000-8000-000000000001'
      and extract(epoch from (end_at - start_at)) = 3600
      and location = 'Locație test'
  ) then raise exception 'viewing was not created with complete links'; end if;
  if not exists (
    select 1 from public.leads where id = '90000000-0000-4000-8000-000000000001'
      and status = 'upcoming_viewing' and next_action_type = 'viewing'
  ) then raise exception 'lead status changed without a complete viewing'; end if;
  if not exists (select 1 from public.activities where type = 'viewing_scheduled' and lead_id = '90000000-0000-4000-8000-000000000001') then
    raise exception 'viewing schedule activity missing';
  end if;
end $$;

select public.transition_crm_viewing(
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  (select viewing_id from phase4_result),
  'reschedule', now() + interval '3 days', 90, 'Cererea clientului'
);

select public.transition_crm_viewing(
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  (select viewing_id from phase4_result),
  'confirm'
);

select public.transition_crm_viewing(
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  (select viewing_id from phase4_result),
  'complete', null, null, null, 'Client interesat', 'Feedback client', 'Feedback proprietar', now() + interval '4 days'
);

do $$
declare viewing_id uuid := (select phase4_result.viewing_id from phase4_result);
begin
  if not exists (
    select 1 from public.calendar_events where id = viewing_id and status = 'efectuata'
      and completed = true and completed_at is not null and outcome = 'Client interesat'
      and client_feedback = 'Feedback client' and owner_feedback = 'Feedback proprietar'
  ) then raise exception 'viewing completion data missing'; end if;
  if not exists (
    select 1 from public.tasks where lead_id = '90000000-0000-4000-8000-000000000001'
      and title = 'Follow-up după vizionare' and status = 'open'
  ) then raise exception 'follow-up task was not created'; end if;
  if not exists (
    select 1 from public.leads where id = '90000000-0000-4000-8000-000000000001'
      and status = 'viewing' and next_action_type = 'follow_up'
  ) then raise exception 'lead follow-up state missing'; end if;
end $$;

do $$
declare viewing_id uuid := (select phase4_result.viewing_id from phase4_result);
begin
  begin
    perform public.transition_crm_viewing(
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      viewing_id, 'cancel', null, null, 'Nu trebuie permis după finalizare'
    );
    raise exception 'completed viewing accepted cancellation';
  exception when others then
    if sqlerrm = 'completed viewing accepted cancellation' then raise; end if;
  end;
end $$;

create temporary table phase4_cancel_result as
select public.create_crm_viewing(
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '90000000-0000-4000-8000-000000000001',
  null,
  '20000000-0000-4000-8000-000000000001',
  null,
  now() + interval '5 days', 60, 'Locație anulare', null, '[]'::jsonb, null
) as viewing_id;

select public.transition_crm_viewing(
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  (select viewing_id from phase4_cancel_result),
  'cancel', null, null, 'Client indisponibil'
);

do $$
begin
  if not exists (
    select 1 from public.calendar_events
    where id = (select viewing_id from phase4_cancel_result)
      and status = 'anulata' and cancellation_reason = 'Client indisponibil'
      and cancelled_at is not null and deleted_at is null
  ) then raise exception 'cancelled viewing history was not preserved'; end if;
end $$;

select json_build_object(
  'viewing_status', (select status from public.calendar_events where id = (select viewing_id from phase4_result)),
  'calendar_rows', (select count(*) from public.calendar_events where type = 'vizionare'),
  'cancelled_rows', (select count(*) from public.calendar_events where type = 'vizionare' and status = 'anulata' and deleted_at is null),
  'follow_up_tasks', (select count(*) from public.tasks where title = 'Follow-up după vizionare'),
  'history_rows', (select count(*) from public.activities where type like 'viewing_%')
);
