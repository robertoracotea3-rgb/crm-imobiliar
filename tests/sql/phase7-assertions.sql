do $$
declare
  new_contact uuid;
  operation_id uuid;
  rejected boolean;
begin
  if public.crm_normalize_client_phone('0722 123 456') <> '40722123456' then raise exception 'phone normalization failed'; end if;
  if public.crm_normalize_client_email(' Test@Example.RO ') <> 'test@example.ro' then raise exception 'email normalization failed'; end if;

  if (select contact_id from public.leads where id = '41000000-0000-0000-0000-000000000001')
     <> '31000000-0000-0000-0000-000000000003' then raise exception 'safe lead was not linked'; end if;
  select contact_id into new_contact from public.leads where id = '41000000-0000-0000-0000-000000000002';
  if new_contact is null then raise exception 'new canonical contact was not created'; end if;
  if (select identity_match_status from public.leads where id = '41000000-0000-0000-0000-000000000003') <> 'ambiguous'
    or (select contact_id from public.leads where id = '41000000-0000-0000-0000-000000000003') is not null
  then raise exception 'ambiguous lead was linked automatically'; end if;
  if not exists (
    select 1 from public.client_merge_candidates
    where primary_contact_id = '31000000-0000-0000-0000-000000000001'
      and duplicate_contact_id = '31000000-0000-0000-0000-000000000002' and status = 'pending'
  ) then raise exception 'duplicate candidate missing'; end if;
  if (select contact_id from public.activities where id = '51000000-0000-0000-0000-000000000001')
     <> '31000000-0000-0000-0000-000000000003' then raise exception 'activity was not linked'; end if;
  if (select contact_id from public.calendar_events where id = '52000000-0000-0000-0000-000000000001')
     <> '31000000-0000-0000-0000-000000000003' then raise exception 'viewing was not linked'; end if;
  if not exists (
    select 1 from public.client_contact_agents
    where contact_id = new_contact and agent_id = 'aaaaaaaa-0000-0000-0000-000000000001' and active
  ) then raise exception 'agent attribution missing'; end if;
  if (select agency_id from public.contacts where id = (
    select contact_id from public.leads where id = '42000000-0000-0000-0000-000000000004'
  )) <> '20000000-0000-0000-0000-000000000002' then raise exception 'cross-agency identity leak'; end if;

  rejected := false;
  begin
    insert into public.leads(
      agency_id, agent_id, assigned_to, contact_id, contact_name, contact_phone,
      source, source_normalized, next_action_at, next_action_type
    ) values (
      '10000000-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
      'aaaaaaaa-0000-0000-0000-000000000001', '32000000-0000-0000-0000-000000000004',
      'Cross Agency', '0744 333 333', 'manual', 'manual', now() + interval '1 day', 'first_contact'
    );
  exception when others then
    rejected := sqlerrm like '%contact_not_in_agency%';
  end;
  if not rejected then raise exception 'cross-agency explicit contact was accepted'; end if;

  insert into public.demands(id, agency_id, agent_id, contact_id, internal_code)
  values ('61000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002', 'CE-MERGE');
  insert into public.transactions(id, agency_id, agent_id, contact_id)
  values ('62000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000002');
  insert into public.leads(
    id, agency_id, agent_id, assigned_to, contact_id, contact_name, contact_phone,
    source, source_normalized, next_action_at, next_action_type
  ) values (
    '63000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000001', 'aaaaaaaa-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000002', 'Merge Lead', '0722 111 111',
    'manual', 'manual', now() + interval '1 day', 'first_contact'
  );

  operation_id := public.merge_crm_contacts(
    '10000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000001',
    '31000000-0000-0000-0000-000000000002',
    'aaaaaaaa-0000-0000-0000-000000000001',
    'verified duplicate'
  );
  if operation_id is null then raise exception 'merge operation missing'; end if;
  if (select merge_status from public.contacts where id = '31000000-0000-0000-0000-000000000002') <> 'merged'
    then raise exception 'duplicate contact not marked merged'; end if;
  if (select contact_id from public.demands where id = '61000000-0000-0000-0000-000000000001')
     <> '31000000-0000-0000-0000-000000000001' then raise exception 'demand not moved'; end if;
  if (select contact_id from public.transactions where id = '62000000-0000-0000-0000-000000000001')
     <> '31000000-0000-0000-0000-000000000001' then raise exception 'transaction not moved'; end if;
  if (select contact_id from public.leads where id = '63000000-0000-0000-0000-000000000001')
     <> '31000000-0000-0000-0000-000000000001' then raise exception 'lead not moved'; end if;

  perform public.revert_crm_contact_merge(
    '10000000-0000-0000-0000-000000000001', operation_id,
    'aaaaaaaa-0000-0000-0000-000000000001', 'revert test'
  );
  if (select merge_status from public.contacts where id = '31000000-0000-0000-0000-000000000002') <> 'active'
    then raise exception 'duplicate contact not restored'; end if;
  if (select contact_id from public.demands where id = '61000000-0000-0000-0000-000000000001')
     <> '31000000-0000-0000-0000-000000000002' then raise exception 'demand not restored'; end if;
  if (select contact_id from public.leads where id = '63000000-0000-0000-0000-000000000001')
     <> '31000000-0000-0000-0000-000000000002' then raise exception 'lead not restored'; end if;
  if (select status from public.client_merge_operations where id = operation_id) <> 'reverted'
    then raise exception 'merge journal not reverted'; end if;
end $$;

select 'phase7 assertions passed' as result;
