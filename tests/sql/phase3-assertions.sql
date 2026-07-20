select public.record_whatsapp_outcome(
  '90000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'opened',
  null
);

do $$
begin
  if exists (
    select 1 from public.leads
    where id = '90000000-0000-4000-8000-000000000001'
      and (status <> 'new' or last_contacted_at is not null or last_contact_attempt_at is not null)
  ) then
    raise exception 'opening WhatsApp falsely changed contact state';
  end if;
  if not exists (
    select 1 from public.activities
    where lead_id = '90000000-0000-4000-8000-000000000001'
      and type = 'whatsapp_opened'
  ) then
    raise exception 'WhatsApp opened activity missing';
  end if;
end $$;

select public.record_whatsapp_outcome(
  '90000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'confirmed_sent',
  now() + interval '2 days'
);

do $$
begin
  if not exists (
    select 1 from public.leads
    where id = '90000000-0000-4000-8000-000000000001'
      and status = 'contacted'
      and last_contacted_at is not null
      and last_contact_attempt_at is not null
      and last_contact_channel = 'whatsapp'
      and first_response_at is not null
      and next_action_at > now()
      and next_action_type = 'follow_up'
  ) then
    raise exception 'confirmed WhatsApp outcome was not persisted correctly';
  end if;
  if not exists (
    select 1 from public.activities
    where lead_id = '90000000-0000-4000-8000-000000000001'
      and type = 'whatsapp_confirmed_sent'
      and description like '%nu sunt confirmate%'
  ) then
    raise exception 'confirmed WhatsApp audit activity missing';
  end if;
  if has_function_privilege(
    'authenticated',
    'public.record_whatsapp_outcome(uuid,uuid,uuid,text,timestamptz)',
    'EXECUTE'
  ) then
    raise exception 'authenticated role can execute the privileged RPC directly';
  end if;
end $$;

select json_build_object(
  'status', (select status from public.leads where id = '90000000-0000-4000-8000-000000000001'),
  'channel', (select last_contact_channel from public.leads where id = '90000000-0000-4000-8000-000000000001'),
  'opened_events', (select count(*) from public.activities where lead_id = '90000000-0000-4000-8000-000000000001' and type = 'whatsapp_opened'),
  'confirmed_events', (select count(*) from public.activities where lead_id = '90000000-0000-4000-8000-000000000001' and type = 'whatsapp_confirmed_sent')
);
