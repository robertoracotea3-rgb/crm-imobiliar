-- Phase 3: factual WhatsApp contact tracking.
-- Opening WhatsApp is distinct from a user-confirmed sent message.

begin;

alter table public.leads add column if not exists last_contact_attempt_at timestamptz;
alter table public.leads add column if not exists last_contacted_at timestamptz;
alter table public.leads add column if not exists last_contact_channel text;
alter table public.leads add column if not exists next_action_at timestamptz;
alter table public.leads add column if not exists next_action_type text;

create index if not exists leads_next_action_idx
  on public.leads(agency_id, next_action_at)
  where next_action_at is not null and deleted_at is null;

create or replace function public.record_whatsapp_outcome(
  p_lead_id uuid,
  p_agency_id uuid,
  p_user_id uuid,
  p_action text,
  p_next_action_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  current_lead public.leads%rowtype;
  action_time timestamptz := now();
  next_time timestamptz;
  activity_type text;
  activity_title text;
  activity_description text;
begin
  if p_action not in ('opened', 'confirmed_sent', 'not_sent', 'unreachable') then
    raise exception 'invalid_whatsapp_action';
  end if;

  select * into current_lead
  from public.leads
  where id = p_lead_id and agency_id = p_agency_id and deleted_at is null
  for update;
  if not found then raise exception 'lead_not_found'; end if;

  if p_action in ('confirmed_sent', 'unreachable') then
    next_time := coalesce(p_next_action_at, action_time + interval '1 day');
    if next_time <= action_time then raise exception 'next_action_must_be_future'; end if;
  end if;

  update public.leads
  set
    last_contact_attempt_at = case when p_action <> 'opened' then action_time else last_contact_attempt_at end,
    last_contact_channel = case when p_action <> 'opened' then 'whatsapp' else last_contact_channel end,
    last_contacted_at = case when p_action = 'confirmed_sent' then action_time else last_contacted_at end,
    first_response_at = case
      when p_action = 'confirmed_sent' then coalesce(first_response_at, action_time)
      else first_response_at
    end,
    status = case
      when p_action = 'confirmed_sent' and status in ('new', 'no_answer', 'to_send_offers') then 'contacted'
      when p_action = 'unreachable' then 'no_answer'
      else status
    end,
    next_action_at = case when next_time is not null then next_time else next_action_at end,
    next_action_type = case when next_time is not null then 'follow_up' else next_action_type end
  where id = p_lead_id and agency_id = p_agency_id;

  select
    case p_action
      when 'opened' then 'whatsapp_opened'
      when 'confirmed_sent' then 'whatsapp_confirmed_sent'
      when 'not_sent' then 'whatsapp_not_sent'
      else 'whatsapp_unreachable'
    end,
    case p_action
      when 'opened' then 'WhatsApp deschis'
      when 'confirmed_sent' then 'Mesaj WhatsApp confirmat'
      when 'not_sent' then 'Mesaj WhatsApp netrimis'
      else 'Client necontactat pe WhatsApp'
    end,
    case p_action
      when 'opened' then 'A fost deschisă conversația WhatsApp; trimiterea nu este încă confirmată.'
      when 'confirmed_sent' then 'Utilizatorul a confirmat că a trimis mesajul. Livrarea și citirea nu sunt confirmate.'
      when 'not_sent' then 'Utilizatorul a confirmat că mesajul nu a fost trimis.'
      else 'Utilizatorul a confirmat că nu a putut contacta clientul pe WhatsApp.'
    end
  into activity_type, activity_title, activity_description;

  insert into public.activities(agency_id, user_id, lead_id, type, title, description)
  values (p_agency_id, p_user_id, p_lead_id, activity_type, activity_title, activity_description);

  return jsonb_build_object(
    'success', true,
    'action', p_action,
    'recorded_at', action_time,
    'next_action_at', next_time
  );
end;
$$;

revoke all on function public.record_whatsapp_outcome(uuid, uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.record_whatsapp_outcome(uuid, uuid, uuid, text, timestamptz)
  to service_role;

commit;
