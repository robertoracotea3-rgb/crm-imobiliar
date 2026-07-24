-- Operational extension 4: a lead becomes contacted only through a documented
-- interaction. Opening/clicking/copying a channel never proves contact.

begin;

alter table public.leads
  add column if not exists last_contact_description text;

insert into public.activity_types(
  code, display_name, display_order, category, ui_color, is_active
) values
  ('contact_attempt', 'Încercare de contact documentată', 64, 'contact', 'amber', true),
  ('contact_success', 'Contact reușit documentat', 65, 'contact', 'emerald', true)
on conflict(code) do update set
  display_name = excluded.display_name,
  display_order = excluded.display_order,
  category = excluded.category,
  ui_color = excluded.ui_color,
  is_active = true;

create table if not exists public.lead_contact_interactions (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete restrict,
  contact_id uuid references public.contacts(id) on delete set null,
  agent_id uuid not null references auth.users(id),
  property_id uuid references public.properties(id) on delete set null,
  channel text not null,
  outcome text not null,
  successful boolean not null,
  description text not null,
  client_need text,
  budget_min numeric,
  budget_max numeric,
  currency text,
  city text,
  zone text,
  next_action_type text not null,
  next_action_at timestamptz not null,
  occurred_at timestamptz not null,
  idempotency_key text not null,
  created_at timestamptz not null default now(),
  unique(agency_id, idempotency_key)
);

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'lead_contact_interactions_channel_check'
      and conrelid = 'public.lead_contact_interactions'::regclass
  ) then
    alter table public.lead_contact_interactions
      add constraint lead_contact_interactions_channel_check
      check (channel in ('phone', 'whatsapp', 'email', 'in_person'))
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'lead_contact_interactions_outcome_check'
      and conrelid = 'public.lead_contact_interactions'::regclass
  ) then
    alter table public.lead_contact_interactions
      add constraint lead_contact_interactions_outcome_check
      check (outcome in (
        'connected_interested',
        'connected_followup',
        'connected_not_interested',
        'no_answer',
        'unreachable',
        'wrong_number',
        'message_sent_waiting_reply'
      ))
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'lead_contact_interactions_description_check'
      and conrelid = 'public.lead_contact_interactions'::regclass
  ) then
    alter table public.lead_contact_interactions
      add constraint lead_contact_interactions_description_check
      check (
        length(trim(description)) between 5 and 4000
        and (client_need is null or length(trim(client_need)) between 3 and 2000)
      )
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'lead_contact_interactions_budget_check'
      and conrelid = 'public.lead_contact_interactions'::regclass
  ) then
    alter table public.lead_contact_interactions
      add constraint lead_contact_interactions_budget_check
      check (
        (budget_min is null or budget_min >= 0)
        and (budget_max is null or budget_max >= 0)
        and (budget_min is null or budget_max is null or budget_min <= budget_max)
      )
      not valid;
  end if;
end
$constraints$;

alter table public.lead_contact_interactions
  validate constraint lead_contact_interactions_channel_check;
alter table public.lead_contact_interactions
  validate constraint lead_contact_interactions_outcome_check;
alter table public.lead_contact_interactions
  validate constraint lead_contact_interactions_description_check;
alter table public.lead_contact_interactions
  validate constraint lead_contact_interactions_budget_check;

create index if not exists lead_contact_interactions_lead_idx
  on public.lead_contact_interactions(agency_id, lead_id, occurred_at desc);
create index if not exists lead_contact_interactions_agent_idx
  on public.lead_contact_interactions(agency_id, agent_id, occurred_at desc);
create index if not exists lead_contact_interactions_contact_idx
  on public.lead_contact_interactions(agency_id, contact_id, occurred_at desc)
  where contact_id is not null;

create or replace function public.crm_record_lead_contact(
  p_agency_id uuid,
  p_actor_id uuid,
  p_lead_id uuid,
  p_channel text,
  p_outcome text,
  p_description text,
  p_client_need text,
  p_property_id uuid,
  p_budget_min numeric,
  p_budget_max numeric,
  p_currency text,
  p_city text,
  p_zone text,
  p_next_action_type text,
  p_next_action_at timestamptz,
  p_occurred_at timestamptz,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  lead_row public.leads%rowtype;
  actor_role text;
  interaction_id uuid;
  inserted_count integer;
  success boolean;
  event_time timestamptz := coalesce(p_occurred_at, now());
  clean_description text := nullif(trim(p_description), '');
  clean_need text := nullif(trim(p_client_need), '');
  clean_next_action text := nullif(trim(p_next_action_type), '');
  outcome_label text;
begin
  if p_channel not in ('phone', 'whatsapp', 'email', 'in_person') then
    raise exception 'invalid_contact_channel';
  end if;
  if p_outcome not in (
    'connected_interested',
    'connected_followup',
    'connected_not_interested',
    'no_answer',
    'unreachable',
    'wrong_number',
    'message_sent_waiting_reply'
  ) then
    raise exception 'invalid_contact_outcome';
  end if;
  if clean_description is null or length(clean_description) < 5 then
    raise exception 'contact_description_required';
  end if;
  success := p_outcome in (
    'connected_interested',
    'connected_followup',
    'connected_not_interested'
  );
  if success and (clean_need is null or length(clean_need) < 3) then
    raise exception 'client_need_required_for_successful_contact';
  end if;
  if clean_next_action is null
     or p_next_action_at is null
     or p_next_action_at <= now() then
    raise exception 'future_next_action_required';
  end if;
  if event_time > now() + interval '5 minutes' then
    raise exception 'contact_time_cannot_be_future';
  end if;
  if p_budget_min is not null and p_budget_min < 0
     or p_budget_max is not null and p_budget_max < 0
     or p_budget_min is not null and p_budget_max is not null
        and p_budget_min > p_budget_max then
    raise exception 'invalid_contact_budget';
  end if;
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'contact_idempotency_key_required';
  end if;

  select * into lead_row
  from public.leads lead
  where lead.id = p_lead_id
    and lead.agency_id = p_agency_id
    and lead.deleted_at is null
  for update;
  if not found then raise exception 'lead_not_found'; end if;

  select profile.role into actor_role
  from public.profiles profile
  where profile.user_id = p_actor_id
    and profile.agency_id = p_agency_id
    and coalesce(profile.status, 'active') = 'active';
  if actor_role is null then raise exception 'contact_actor_not_in_agency'; end if;
  if p_actor_id is distinct from coalesce(lead_row.responsible_agent_id, lead_row.agent_id)
     and actor_role not in ('owner', 'admin', 'manager') then
    raise exception 'contact_actor_not_allowed';
  end if;

  if p_property_id is not null and not exists (
    select 1 from public.properties property
    where property.id = p_property_id
      and property.agency_id = p_agency_id
      and property.deleted_at is null
  ) then
    raise exception 'contact_property_outside_agency_or_missing';
  end if;

  insert into public.lead_contact_interactions(
    agency_id, lead_id, contact_id, agent_id, property_id,
    channel, outcome, successful, description, client_need,
    budget_min, budget_max, currency, city, zone,
    next_action_type, next_action_at, occurred_at, idempotency_key
  ) values (
    p_agency_id, p_lead_id, lead_row.contact_id, p_actor_id, p_property_id,
    p_channel, p_outcome, success, clean_description, clean_need,
    p_budget_min, p_budget_max, nullif(trim(p_currency), ''),
    nullif(trim(p_city), ''), nullif(trim(p_zone), ''),
    clean_next_action, p_next_action_at, event_time, trim(p_idempotency_key)
  )
  on conflict(agency_id, idempotency_key) do nothing
  returning id into interaction_id;
  get diagnostics inserted_count = row_count;

  if inserted_count = 0 then
    select interaction.id into interaction_id
    from public.lead_contact_interactions interaction
    where interaction.agency_id = p_agency_id
      and interaction.idempotency_key = trim(p_idempotency_key);
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'interaction_id', interaction_id
    );
  end if;

  update public.leads lead
  set first_contact_attempt_at = coalesce(lead.first_contact_attempt_at, event_time),
      last_contact_attempt_at = event_time,
      last_contact_channel = p_channel,
      contact_attempt_count = coalesce(lead.contact_attempt_count, 0) + 1,
      contact_outcome = p_outcome,
      last_contact_description = clean_description,
      first_successful_contact_at = case
        when success then coalesce(lead.first_successful_contact_at, event_time)
        else lead.first_successful_contact_at
      end,
      first_response_at = case
        when success then coalesce(lead.first_response_at, event_time)
        else lead.first_response_at
      end,
      last_contacted_at = case when success then event_time else lead.last_contacted_at end,
      contacted_by_user_id = case
        when success and lead.first_successful_contact_at is null then p_actor_id
        else lead.contacted_by_user_id
      end,
      contact_sla_status = case
        when success and lead.first_contact_due_at is not null
          and event_time <= lead.first_contact_due_at then 'met'
        when success then 'late'
        when lead.first_contact_due_at is not null
          and lead.first_contact_due_at <= now() then 'overdue'
        else 'pending'
      end,
      status = case
        when success then 'contacted'
        when p_outcome in ('no_answer', 'unreachable', 'wrong_number') then 'no_answer'
        else lead.status
      end,
      pipeline_stage = case
        when success then 'contactat'
        when lead.pipeline_stage in ('lead_nou', 'de_contactat') then 'de_contactat'
        else lead.pipeline_stage
      end,
      pipeline_stage_changed_at = case
        when success and lead.pipeline_stage is distinct from 'contactat' then now()
        when not success
          and lead.pipeline_stage = 'lead_nou' then now()
        else lead.pipeline_stage_changed_at
      end,
      next_action_type = clean_next_action,
      next_action_at = p_next_action_at
  where lead.id = p_lead_id
    and lead.agency_id = p_agency_id;

  outcome_label := case p_outcome
    when 'connected_interested' then 'Contactat · interesat'
    when 'connected_followup' then 'Contactat · revenire programată'
    when 'connected_not_interested' then 'Contactat · nu mai este interesat'
    when 'no_answer' then 'Nu a răspuns'
    when 'unreachable' then 'Nu a putut fi contactat'
    when 'wrong_number' then 'Număr greșit'
    else 'Mesaj trimis · răspuns în așteptare'
  end;

  insert into public.activities(
    agency_id, user_id, agent_id, lead_id, contact_id, property_id,
    type, title, description, scheduled_at, created_at
  ) values (
    p_agency_id, p_actor_id, p_actor_id, p_lead_id, lead_row.contact_id, p_property_id,
    case when success then 'contact_success' else 'contact_attempt' end,
    outcome_label,
    concat_ws(E'\n',
      'Conversație: ' || clean_description,
      case when clean_need is not null then 'Clientul dorește: ' || clean_need end,
      case when p_budget_min is not null or p_budget_max is not null
        then 'Buget: ' || coalesce(p_budget_min::text, '?') || ' – ' ||
          coalesce(p_budget_max::text, '?') || ' ' || coalesce(nullif(trim(p_currency), ''), 'EUR') end,
      case when nullif(trim(p_city), '') is not null or nullif(trim(p_zone), '') is not null
        then 'Zonă: ' || concat_ws(' · ', nullif(trim(p_city), ''), nullif(trim(p_zone), '')) end,
      'Următoarea acțiune: ' || clean_next_action || ' · ' || p_next_action_at::text
    ),
    p_next_action_at,
    event_time
  );

  if to_regclass('public.lead_pipeline_events') is not null then
    insert into public.lead_pipeline_events(
      agency_id, lead_id, from_stage, to_stage, reason, note,
      source, actor_id, evidence, dedup_key, created_at
    ) values (
      p_agency_id,
      p_lead_id,
      lead_row.pipeline_stage,
      case
        when success then 'contactat'
        when lead_row.pipeline_stage in ('lead_nou', 'de_contactat') then 'de_contactat'
        else lead_row.pipeline_stage
      end,
      outcome_label,
      clean_description,
      'manual',
      p_actor_id,
      jsonb_build_object(
        'interaction_id', interaction_id,
        'channel', p_channel,
        'outcome', p_outcome,
        'successful', success
      ),
      'contact-interaction:' || interaction_id::text,
      event_time
    )
    on conflict(agency_id, lead_id, dedup_key) do nothing;
  end if;

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'interaction_id', interaction_id,
    'successful_contact', success,
    'contact_sla_status', case
      when success and lead_row.first_contact_due_at is not null
        and event_time <= lead_row.first_contact_due_at then 'met'
      when success then 'late'
      when lead_row.first_contact_due_at is not null
        and lead_row.first_contact_due_at <= now() then 'overdue'
      else 'pending'
    end
  );
end
$function$;

create or replace function public.crm_enforce_contact_evidence()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.status = 'contacted'
     and (tg_op = 'INSERT' or old.status is distinct from 'contacted')
     and new.first_successful_contact_at is null then
    raise exception 'successful_contact_interaction_required';
  end if;
  if new.pipeline_stage = 'contactat'
     and (tg_op = 'INSERT' or old.pipeline_stage is distinct from 'contactat')
     and new.first_successful_contact_at is null then
    raise exception 'successful_contact_interaction_required';
  end if;
  return new;
end
$function$;

create or replace function public.crm_missing_contact_description_count(
  p_agency_id uuid,
  p_user_id uuid,
  p_scope_all boolean
)
returns bigint
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select count(*)
  from public.leads lead
  where lead.agency_id = p_agency_id
    and lead.deleted_at is null
    and (p_scope_all or lead.responsible_agent_id = p_user_id)
    and coalesce(lead.pipeline_stage, 'lead_nou') not in ('finalizat', 'pierdut')
    and nullif(trim(coalesce(lead.last_contact_description, '')), '') is null
    and exists (
      select 1
      from public.profiles profile
      where profile.agency_id = p_agency_id
        and profile.user_id = p_user_id
        and coalesce(profile.status, 'active') = 'active'
    )
$$;

drop trigger if exists crm_enforce_contact_evidence_trigger on public.leads;
create trigger crm_enforce_contact_evidence_trigger
before insert or update of status, pipeline_stage on public.leads
for each row execute function public.crm_enforce_contact_evidence();

-- Correct the legacy WhatsApp RPC: a confirmed sent message is an attempt, not
-- proof that the client answered or that a conversation took place.
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
as $function$
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
    first_contact_attempt_at = case
      when p_action in ('confirmed_sent', 'unreachable')
        then coalesce(first_contact_attempt_at, action_time)
      else first_contact_attempt_at
    end,
    last_contact_attempt_at = case
      when p_action in ('confirmed_sent', 'unreachable') then action_time
      else last_contact_attempt_at
    end,
    last_contact_channel = case
      when p_action in ('confirmed_sent', 'unreachable') then 'whatsapp'
      else last_contact_channel
    end,
    contact_attempt_count = case
      when p_action in ('confirmed_sent', 'unreachable')
        then coalesce(contact_attempt_count, 0) + 1
      else contact_attempt_count
    end,
    contact_outcome = case
      when p_action = 'confirmed_sent' then 'message_sent_waiting_reply'
      when p_action = 'unreachable' then 'unreachable'
      else contact_outcome
    end,
    status = case when p_action = 'unreachable' then 'no_answer' else status end,
    pipeline_stage = case
      when p_action in ('confirmed_sent', 'unreachable')
        and pipeline_stage = 'lead_nou' then 'de_contactat'
      else pipeline_stage
    end,
    pipeline_stage_changed_at = case
      when p_action in ('confirmed_sent', 'unreachable')
        and pipeline_stage = 'lead_nou' then action_time
      else pipeline_stage_changed_at
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
      when 'confirmed_sent' then 'Mesaj WhatsApp trimis · răspuns neconfirmat'
      when 'not_sent' then 'Mesaj WhatsApp netrimis'
      else 'Client necontactat pe WhatsApp'
    end,
    case p_action
      when 'opened' then 'Conversația WhatsApp a fost deschisă; nu s-a înregistrat o încercare sau un contact reușit.'
      when 'confirmed_sent' then 'Utilizatorul a confirmat trimiterea. Aceasta este doar o încercare; răspunsul clientului și conversația nu sunt confirmate.'
      when 'not_sent' then 'Utilizatorul a confirmat că mesajul nu a fost trimis.'
      else 'Utilizatorul a confirmat că nu a putut contacta clientul pe WhatsApp.'
    end
  into activity_type, activity_title, activity_description;

  insert into public.activities(agency_id, user_id, lead_id, type, title, description)
  values (p_agency_id, p_user_id, p_lead_id, activity_type, activity_title, activity_description);

  return jsonb_build_object(
    'success', true,
    'action', p_action,
    'successful_contact', false,
    'recorded_at', action_time,
    'next_action_at', next_time
  );
end
$function$;

alter table public.lead_contact_interactions enable row level security;
revoke all on table public.lead_contact_interactions from public, anon, authenticated;
grant select on table public.lead_contact_interactions to authenticated;
grant select, insert, update, delete on table public.lead_contact_interactions to service_role;

drop policy if exists crm_lead_contact_interactions_select
  on public.lead_contact_interactions;
create policy crm_lead_contact_interactions_select
on public.lead_contact_interactions
for select to authenticated
using (
  agency_id = public.current_crm_agency_id()
  and exists (
    select 1
    from public.leads lead
    where lead.id = lead_contact_interactions.lead_id
      and lead.agency_id = lead_contact_interactions.agency_id
      and public.crm_can_access_row(
        'leads',
        array[coalesce(lead.responsible_agent_id, lead.agent_id)]::uuid[]
      )
  )
);

revoke all on function public.crm_record_lead_contact(
  uuid, uuid, uuid, text, text, text, text, uuid, numeric, numeric,
  text, text, text, text, timestamptz, timestamptz, text
) from public, anon, authenticated;
revoke all on function public.crm_enforce_contact_evidence()
  from public, anon, authenticated;
revoke all on function public.crm_missing_contact_description_count(uuid, uuid, boolean)
  from public, anon, authenticated;
grant execute on function public.crm_record_lead_contact(
  uuid, uuid, uuid, text, text, text, text, uuid, numeric, numeric,
  text, text, text, text, timestamptz, timestamptz, text
) to service_role;
grant execute on function public.crm_enforce_contact_evidence() to service_role;
grant execute on function public.crm_missing_contact_description_count(uuid, uuid, boolean)
  to service_role;

commit;
