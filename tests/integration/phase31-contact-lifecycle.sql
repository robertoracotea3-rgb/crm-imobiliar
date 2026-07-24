\set ON_ERROR_STOP on

begin;

insert into auth.users(id,email) values
  ('31000000-0000-4000-8000-000000000001','owner31@example.invalid'),
  ('31000000-0000-4000-8000-000000000002','agent31@example.invalid'),
  ('31000000-0000-4000-8000-000000000003','other31@example.invalid');
insert into public.agencies(id,name) values
  ('31000000-0000-4000-8000-000000000010','Agency 31'),
  ('31000000-0000-4000-8000-000000000011','Other agency 31');
insert into public.profiles(user_id,agency_id,role,full_name,status) values
  ('31000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000010','owner','Owner 31','active'),
  ('31000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000010','agent','Agent 31','active'),
  ('31000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000011','owner','Other 31','active');

insert into public.contacts(
  id,agency_id,full_name,phone,agent_id,created_at,lifecycle_status
) values
  ('31000000-0000-4000-8000-000000000020','31000000-0000-4000-8000-000000000010','Client cu cerere','0700003120','31000000-0000-4000-8000-000000000002',now()-interval '10 days','client_nou'),
  ('31000000-0000-4000-8000-000000000021','31000000-0000-4000-8000-000000000010','Client reactivat','0700003121','31000000-0000-4000-8000-000000000002',now()-interval '100 days','client_nou'),
  ('31000000-0000-4000-8000-000000000022','31000000-0000-4000-8000-000000000010','Client vechi','0700003122','31000000-0000-4000-8000-000000000002',now()-interval '100 days','contactat'),
  ('31000000-0000-4000-8000-000000000023','31000000-0000-4000-8000-000000000011','Client altă agenție','0700003123','31000000-0000-4000-8000-000000000003',now()-interval '10 days','client_nou');

insert into public.demands(
  id,agency_id,contact_id,agent_id,status,updated_at
) values (
  '31000000-0000-4000-8000-000000000030',
  '31000000-0000-4000-8000-000000000010',
  '31000000-0000-4000-8000-000000000020',
  '31000000-0000-4000-8000-000000000002',
  'activa',
  now()
);

do $test$
declare
  archived jsonb;
  refreshed jsonb;
begin
  begin
    perform public.crm_transition_contact_lifecycle(
      '31000000-0000-4000-8000-000000000010',
      '31000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000020',
      'arhivat',
      'Clientul nu mai caută momentan.',
      'phase31-active-demand'
    );
    raise exception 'contact_with_active_demand_was_archived';
  exception when others then
    if sqlerrm = 'contact_with_active_demand_was_archived' then raise; end if;
    if sqlerrm not like 'contact_lifecycle_blocked:%cerere activă%' then raise; end if;
  end;

  if (select lifecycle_status from public.contacts
      where id='31000000-0000-4000-8000-000000000020') <> 'client_activ' then
    raise exception 'active_demand_did_not_activate_contact';
  end if;

  archived := public.crm_transition_contact_lifecycle(
    '31000000-0000-4000-8000-000000000010',
    '31000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000021',
    'arhivat',
    'Clientul a confirmat că nu mai caută.',
    'phase31-archive'
  );
  if archived->>'status' <> 'arhivat'
     or not exists (
       select 1 from public.contacts
       where id='31000000-0000-4000-8000-000000000021'
         and lifecycle_status='arhivat'
         and deleted_at is null
         and archive_reason is not null
     ) then
    raise exception 'logical_archive_failed:%', archived;
  end if;

  begin
    update public.contacts
    set lifecycle_status='contactat'
    where id='31000000-0000-4000-8000-000000000021';
    raise exception 'direct_lifecycle_update_was_allowed';
  exception when others then
    if sqlerrm = 'direct_lifecycle_update_was_allowed' then raise; end if;
  end;

  begin
    perform public.crm_transition_contact_lifecycle(
      '31000000-0000-4000-8000-000000000011',
      '31000000-0000-4000-8000-000000000001',
      '31000000-0000-4000-8000-000000000023',
      'de_contactat',
      'Încercare între agenții.',
      'phase31-cross-agency'
    );
    raise exception 'cross_agency_lifecycle_change_was_allowed';
  exception when others then
    if sqlerrm = 'cross_agency_lifecycle_change_was_allowed' then raise; end if;
  end;
end
$test$;

insert into public.leads(
  id,agency_id,contact_name,contact_phone,contact_id,agent_id,
  status,pipeline_stage,received_at,created_at,source,source_normalized
) values (
  '31000000-0000-4000-8000-000000000040',
  '31000000-0000-4000-8000-000000000010',
  'Client reactivat',
  '0700003121',
  '31000000-0000-4000-8000-000000000021',
  '31000000-0000-4000-8000-000000000002',
  'new',
  'lead_nou',
  now(),
  now(),
  'storia',
  'storia'
);

do $test$
begin
  if not exists (
    select 1
    from public.contacts
    where id='31000000-0000-4000-8000-000000000021'
      and lifecycle_status='client_nou'
      and archived_at is null
      and archive_reason is null
      and reactivated_at is not null
      and deleted_at is null
  ) then
    raise exception 'archived_contact_was_not_reactivated';
  end if;
  if not exists (
    select 1
    from public.contact_lifecycle_events
    where contact_id='31000000-0000-4000-8000-000000000021'
      and from_status='arhivat'
      and to_status='client_nou'
      and source='new_lead'
  ) then
    raise exception 'reactivation_history_is_missing';
  end if;
end
$test$;

insert into public.leads(
  id,agency_id,contact_name,contact_phone,contact_id,agent_id,
  status,pipeline_stage,first_successful_contact_at,first_response_at,
  received_at,created_at,source,source_normalized
) values (
  '31000000-0000-4000-8000-000000000041',
  '31000000-0000-4000-8000-000000000010',
  'Client vechi',
  '0700003122',
  '31000000-0000-4000-8000-000000000022',
  '31000000-0000-4000-8000-000000000002',
  'contacted',
  'contactat',
  now()-interval '90 days',
  now()-interval '90 days',
  now()-interval '90 days',
  now()-interval '90 days',
  'manual',
  'manual'
);

do $test$
declare
  refreshed jsonb;
begin
  refreshed := public.crm_refresh_contact_lifecycle(
    now(),
    '31000000-0000-4000-8000-000000000010',
    60
  );
  if refreshed->>'marked_old' <> '1'
     or (select lifecycle_status from public.contacts
         where id='31000000-0000-4000-8000-000000000022') <> 'client_vechi' then
    raise exception 'eligible_contact_was_not_marked_old:%', refreshed;
  end if;
end
$test$;

select 'phase31_contact_lifecycle_ok' as result;

rollback;
