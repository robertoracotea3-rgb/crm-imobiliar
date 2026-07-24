\set ON_ERROR_STOP on

begin;

insert into auth.users(id,email) values
  ('30000000-0000-4000-8000-000000000001','owner30@example.invalid'),
  ('30000000-0000-4000-8000-000000000002','agent-a30@example.invalid'),
  ('30000000-0000-4000-8000-000000000003','agent-b30@example.invalid');
insert into public.agencies(id,name) values
  ('30000000-0000-4000-8000-000000000010','Agency 30');
insert into public.profiles(user_id,agency_id,role,full_name,status) values
  ('30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010','owner','Owner 30','active'),
  ('30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000010','agent','Agent A 30','active'),
  ('30000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000010','agent','Agent B 30','active');

insert into public.properties(
  id,agency_id,agent_id,internal_code,title,city,category,status
) values (
  '30000000-0000-4000-8000-000000000020',
  '30000000-0000-4000-8000-000000000010',
  '30000000-0000-4000-8000-000000000002',
  'KIRA-300',
  'Proprietate contact',
  'Făgăraș',
  'apartament',
  'activa'
);

insert into public.leads(
  id,agency_id,contact_name,contact_phone,property_id,source,source_normalized,association_status
) values
  ('30000000-0000-4000-8000-000000000030','30000000-0000-4000-8000-000000000010','Client contactat','0700000030','30000000-0000-4000-8000-000000000020','storia','storia','linked'),
  ('30000000-0000-4000-8000-000000000031','30000000-0000-4000-8000-000000000010','Client WhatsApp','0700000031','30000000-0000-4000-8000-000000000020','storia','storia','linked'),
  ('30000000-0000-4000-8000-000000000032','30000000-0000-4000-8000-000000000010','Client fără dovadă','0700000032','30000000-0000-4000-8000-000000000020','manual','manual','linked');

do $test$
declare
  result jsonb;
  duplicate_result jsonb;
  whatsapp_result jsonb;
begin
  begin
    perform public.crm_record_lead_contact(
      '30000000-0000-4000-8000-000000000010',
      '30000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000030',
      'phone','connected_interested',' ','Caută apartament',
      '30000000-0000-4000-8000-000000000020',
      70000,90000,'EUR','Făgăraș','Centru',
      'send_properties',now()+interval '1 day',now(),'contact-30-invalid'
    );
    raise exception 'empty_contact_description_was_allowed';
  exception when others then
    if sqlerrm = 'empty_contact_description_was_allowed' then raise; end if;
  end;

  begin
    perform public.crm_record_lead_contact(
      '30000000-0000-4000-8000-000000000010',
      '30000000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-000000000030',
      'phone','connected_interested','Discuție reală','Caută apartament',
      '30000000-0000-4000-8000-000000000020',
      70000,90000,'EUR','Făgăraș','Centru',
      'send_properties',now()+interval '1 day',now(),'contact-30-other-agent'
    );
    raise exception 'other_agent_recorded_contact_without_permission';
  exception when others then
    if sqlerrm = 'other_agent_recorded_contact_without_permission' then raise; end if;
  end;

  result := public.crm_record_lead_contact(
    '30000000-0000-4000-8000-000000000010',
    '30000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000030',
    'phone','connected_interested',
    'Clientul dorește o vizionare după ce primește trei variante.',
    'Apartament cu două camere, luminos și cu loc de parcare',
    '30000000-0000-4000-8000-000000000020',
    70000,90000,'EUR','Făgăraș','Centru',
    'send_properties',now()+interval '1 day',now(),'contact-30-success'
  );
  if result->>'successful_contact' <> 'true' then
    raise exception 'documented_contact_was_not_successful: %', result;
  end if;
  if not exists (
    select 1 from public.leads
    where id = '30000000-0000-4000-8000-000000000030'
      and first_contact_attempt_at is not null
      and first_successful_contact_at is not null
      and contact_attempt_count = 1
      and status = 'contacted'
      and pipeline_stage = 'contactat'
      and last_contact_description like 'Clientul dorește%'
  ) then
    raise exception 'lead_was_not_updated_from_contact_evidence';
  end if;
  if not exists (
    select 1 from public.activities
    where lead_id = '30000000-0000-4000-8000-000000000030'
      and type = 'contact_success'
      and description like '%Conversație:%'
      and description like '%Clientul dorește:%'
  ) then
    raise exception 'contact_activity_is_missing_from_timeline';
  end if;

  duplicate_result := public.crm_record_lead_contact(
    '30000000-0000-4000-8000-000000000010',
    '30000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000030',
    'phone','connected_interested',
    'Clientul dorește o vizionare după ce primește trei variante.',
    'Apartament cu două camere, luminos și cu loc de parcare',
    '30000000-0000-4000-8000-000000000020',
    70000,90000,'EUR','Făgăraș','Centru',
    'send_properties',now()+interval '1 day',now(),'contact-30-success'
  );
  if duplicate_result->>'duplicate' <> 'true'
     or (select contact_attempt_count from public.leads
       where id = '30000000-0000-4000-8000-000000000030') <> 1 then
    raise exception 'contact_idempotency_failed: %', duplicate_result;
  end if;

  whatsapp_result := public.record_whatsapp_outcome(
    '30000000-0000-4000-8000-000000000031',
    '30000000-0000-4000-8000-000000000010',
    '30000000-0000-4000-8000-000000000002',
    'confirmed_sent',
    now()+interval '1 day'
  );
  if whatsapp_result->>'successful_contact' <> 'false' then
    raise exception 'whatsapp_click_was_marked_successful';
  end if;
  if not exists (
    select 1 from public.leads
    where id = '30000000-0000-4000-8000-000000000031'
      and first_successful_contact_at is null
      and first_response_at is null
      and status <> 'contacted'
      and pipeline_stage = 'de_contactat'
      and contact_attempt_count = 1
      and contact_outcome = 'message_sent_waiting_reply'
  ) then
    raise exception 'whatsapp_attempt_created_false_contact_evidence';
  end if;

  begin
    update public.leads
    set status = 'contacted', pipeline_stage = 'contactat'
    where id = '30000000-0000-4000-8000-000000000032';
    raise exception 'direct_contact_status_without_evidence_was_allowed';
  exception when others then
    if sqlerrm = 'direct_contact_status_without_evidence_was_allowed' then raise; end if;
  end;
end
$test$;

select 'phase30_factual_contact_ok' as result;

rollback;
