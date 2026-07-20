-- Phase 4: real viewing workflow stored in calendar_events.
-- The existing table remains the source of truth for both viewings and the internal calendar.

begin;

alter table public.calendar_events add column if not exists lead_id uuid;
alter table public.calendar_events add column if not exists location text;
alter table public.calendar_events add column if not exists participants jsonb not null default '[]'::jsonb;
alter table public.calendar_events add column if not exists reminder_at timestamptz;
alter table public.calendar_events add column if not exists confirmation_status text default 'pending';
alter table public.calendar_events add column if not exists confirmed_at timestamptz;
alter table public.calendar_events add column if not exists cancellation_reason text;
alter table public.calendar_events add column if not exists cancelled_at timestamptz;
alter table public.calendar_events add column if not exists completed_at timestamptz;
alter table public.calendar_events add column if not exists client_feedback text;
alter table public.calendar_events add column if not exists owner_feedback text;
alter table public.calendar_events add column if not exists next_action_at timestamptz;
alter table public.calendar_events add column if not exists calendar_sync_status text default 'not_configured';
alter table public.calendar_events add column if not exists calendar_sync_error text;
alter table public.calendar_events add column if not exists rescheduled_at timestamptz;
alter table public.calendar_events add column if not exists reschedule_reason text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'calendar_events_lead_id_fkey'
      and conrelid = 'public.calendar_events'::regclass
  ) then
    alter table public.calendar_events
      add constraint calendar_events_lead_id_fkey
      foreign key (lead_id) references public.leads(id) on delete set null not valid;
  end if;
end $$;

create index if not exists calendar_events_lead_idx
  on public.calendar_events(agency_id, lead_id, start_at desc)
  where lead_id is not null and deleted_at is null;
create index if not exists calendar_events_property_viewing_idx
  on public.calendar_events(agency_id, property_id, start_at desc)
  where type = 'vizionare' and deleted_at is null;
create index if not exists calendar_events_agent_upcoming_idx
  on public.calendar_events(agency_id, agent_id, start_at)
  where type = 'vizionare' and status in ('programata', 'confirmata') and deleted_at is null;

create or replace function public.create_crm_viewing(
  p_agency_id uuid,
  p_user_id uuid,
  p_lead_id uuid,
  p_contact_id uuid,
  p_property_id uuid,
  p_agent_id uuid,
  p_start_at timestamptz,
  p_duration_minutes integer,
  p_location text,
  p_description text,
  p_participants jsonb,
  p_reminder_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  property_row record;
  lead_row record;
  contact_row record;
  final_agent uuid;
  lead_agent uuid;
  viewing_id uuid;
  client_name text;
  client_phone text;
begin
  if p_start_at is null or p_start_at <= now() then raise exception 'viewing_must_be_future'; end if;
  if coalesce(p_duration_minutes, 0) < 15 or p_duration_minutes > 480 then raise exception 'invalid_duration'; end if;
  if p_property_id is null then raise exception 'property_required'; end if;
  if p_lead_id is null and p_contact_id is null then raise exception 'client_required'; end if;

  select id, title, agent_id into property_row
  from public.properties
  where id = p_property_id and agency_id = p_agency_id and deleted_at is null;
  if not found then raise exception 'property_not_found'; end if;

  if p_lead_id is not null then
    select id, contact_name, contact_phone, agent_id into lead_row
    from public.leads
    where id = p_lead_id and agency_id = p_agency_id and deleted_at is null;
    if not found then raise exception 'lead_not_found'; end if;
    client_name := lead_row.contact_name;
    client_phone := lead_row.contact_phone;
    lead_agent := lead_row.agent_id;
  end if;

  if p_contact_id is not null then
    select id, full_name, phone into contact_row
    from public.contacts
    where id = p_contact_id and agency_id = p_agency_id and deleted_at is null;
    if not found then raise exception 'contact_not_found'; end if;
    client_name := coalesce(client_name, contact_row.full_name);
    client_phone := coalesce(client_phone, contact_row.phone);
  end if;

  final_agent := coalesce(p_agent_id, property_row.agent_id, lead_agent, p_user_id);
  if not exists (
    select 1 from public.profiles where user_id = final_agent and agency_id = p_agency_id
  ) then raise exception 'agent_not_found'; end if;

  insert into public.calendar_events(
    agency_id, created_by, type, title, start_at, end_at, description,
    contact_name, contact_phone, contact_id, lead_id, property_id, agent_id,
    status, completed, location, participants, reminder_at,
    confirmation_status, calendar_sync_status
  ) values (
    p_agency_id, p_user_id, 'vizionare',
    concat('Vizionare - ', coalesce(client_name, 'Client'), ' - ', coalesce(property_row.title, 'Proprietate')),
    p_start_at, p_start_at + make_interval(mins => p_duration_minutes), nullif(trim(p_description), ''),
    client_name, client_phone, p_contact_id, p_lead_id, p_property_id, final_agent,
    'programata', false, nullif(trim(p_location), ''), coalesce(p_participants, '[]'::jsonb),
    p_reminder_at, 'pending', 'not_configured'
  ) returning id into viewing_id;

  if p_lead_id is not null then
    update public.leads
    set status = 'upcoming_viewing',
        next_action_at = p_start_at,
        next_action_type = 'viewing'
    where id = p_lead_id and agency_id = p_agency_id;
  end if;

  insert into public.activities(
    agency_id, user_id, agent_id, lead_id, contact_id, property_id,
    type, title, description, scheduled_at
  ) values (
    p_agency_id, p_user_id, final_agent, p_lead_id, p_contact_id, p_property_id,
    'viewing_scheduled', 'Vizionare programată',
    concat('Vizionare creată în calendar pentru ', p_start_at::text), p_start_at
  );

  return viewing_id;
end;
$$;

create or replace function public.transition_crm_viewing(
  p_agency_id uuid,
  p_user_id uuid,
  p_viewing_id uuid,
  p_action text,
  p_start_at timestamptz default null,
  p_duration_minutes integer default null,
  p_reason text default null,
  p_outcome text default null,
  p_client_feedback text default null,
  p_owner_feedback text default null,
  p_next_action_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  viewing public.calendar_events%rowtype;
  activity_title text;
begin
  select * into viewing from public.calendar_events
  where id = p_viewing_id and agency_id = p_agency_id
    and type = 'vizionare' and deleted_at is null
  for update;
  if not found then raise exception 'viewing_not_found'; end if;

  if p_action = 'confirm' then
    if viewing.status not in ('programata', 'amanata') then raise exception 'invalid_viewing_transition'; end if;
    update public.calendar_events set status = 'confirmata', confirmation_status = 'confirmed',
      confirmed_at = now(), updated_at = now() where id = p_viewing_id;
    activity_title := 'Vizionare confirmată';
  elsif p_action = 'reschedule' then
    if viewing.status not in ('programata', 'confirmata', 'amanata') then raise exception 'invalid_viewing_transition'; end if;
    if p_start_at is null or p_start_at <= now() then raise exception 'viewing_must_be_future'; end if;
    if coalesce(p_duration_minutes, 0) < 15 or p_duration_minutes > 480 then raise exception 'invalid_duration'; end if;
    if nullif(trim(p_reason), '') is null then raise exception 'reschedule_reason_required'; end if;
    update public.calendar_events set start_at = p_start_at,
      end_at = p_start_at + make_interval(mins => p_duration_minutes), status = 'programata',
      confirmation_status = 'pending', confirmed_at = null, rescheduled_at = now(),
      reschedule_reason = trim(p_reason), updated_at = now() where id = p_viewing_id;
    if viewing.lead_id is not null then
      update public.leads set status = 'upcoming_viewing', next_action_at = p_start_at,
        next_action_type = 'viewing' where id = viewing.lead_id and agency_id = p_agency_id;
    end if;
    activity_title := 'Vizionare reprogramată';
  elsif p_action = 'cancel' then
    if viewing.status in ('efectuata', 'anulata') then raise exception 'invalid_viewing_transition'; end if;
    if nullif(trim(p_reason), '') is null then raise exception 'cancellation_reason_required'; end if;
    update public.calendar_events set status = 'anulata', completed = false,
      cancellation_reason = trim(p_reason), cancelled_at = now(), updated_at = now()
      where id = p_viewing_id;
    activity_title := 'Vizionare anulată';
  elsif p_action = 'complete' then
    if viewing.status not in ('programata', 'confirmata', 'amanata') then raise exception 'invalid_viewing_transition'; end if;
    if nullif(trim(p_outcome), '') is null then raise exception 'outcome_required'; end if;
    update public.calendar_events set status = 'efectuata', completed = true, completed_at = now(),
      outcome = trim(p_outcome), client_feedback = nullif(trim(p_client_feedback), ''),
      owner_feedback = nullif(trim(p_owner_feedback), ''), next_action_at = p_next_action_at,
      updated_at = now() where id = p_viewing_id;
    if viewing.lead_id is not null then
      update public.leads set status = 'viewing', next_action_at = coalesce(p_next_action_at, now() + interval '1 day'),
        next_action_type = 'follow_up' where id = viewing.lead_id and agency_id = p_agency_id;
    end if;
    insert into public.tasks(
      agency_id, created_by, assigned_to, title, description, priority, status,
      due_at, property_id, lead_id
    ) values (
      p_agency_id, p_user_id, viewing.agent_id, 'Follow-up după vizionare',
      concat('Rezultat: ', trim(p_outcome)), 'mare', 'open',
      coalesce(p_next_action_at, now() + interval '1 day'), viewing.property_id, viewing.lead_id
    );
    activity_title := 'Vizionare efectuată';
  else
    raise exception 'invalid_viewing_action';
  end if;

  insert into public.activities(
    agency_id, user_id, agent_id, lead_id, contact_id, property_id,
    type, title, description
  ) values (
    p_agency_id, p_user_id, viewing.agent_id, viewing.lead_id, viewing.contact_id,
    viewing.property_id, concat('viewing_', p_action), activity_title,
    coalesce(nullif(trim(p_reason), ''), nullif(trim(p_outcome), ''), activity_title)
  );

  return jsonb_build_object('success', true, 'action', p_action, 'viewing_id', p_viewing_id);
end;
$$;

revoke all on function public.create_crm_viewing(uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,integer,text,text,jsonb,timestamptz)
  from public, anon, authenticated;
grant execute on function public.create_crm_viewing(uuid,uuid,uuid,uuid,uuid,uuid,timestamptz,integer,text,text,jsonb,timestamptz)
  to service_role;
revoke all on function public.transition_crm_viewing(uuid,uuid,uuid,text,timestamptz,integer,text,text,text,text,timestamptz)
  from public, anon, authenticated;
grant execute on function public.transition_crm_viewing(uuid,uuid,uuid,text,timestamptz,integer,text,text,text,text,timestamptz)
  to service_role;

commit;
