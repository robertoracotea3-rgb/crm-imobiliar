-- Operational extension 3: factual 24-hour contact SLA.
-- All timestamps are stored as timestamptz. Business-day presentation and
-- "today" calculations use Europe/Bucharest explicitly.

begin;

alter table public.leads
  add column if not exists assigned_by_user_id uuid references auth.users(id);
alter table public.leads
  add column if not exists first_contact_attempt_at timestamptz;
alter table public.leads
  add column if not exists first_successful_contact_at timestamptz;
alter table public.leads
  add column if not exists contacted_by_user_id uuid references auth.users(id);
alter table public.leads
  add column if not exists contact_outcome text;
alter table public.leads
  add column if not exists contact_attempt_count integer not null default 0;
alter table public.leads
  add column if not exists contact_sla_status text;
alter table public.leads
  add column if not exists sla_12h_notified_at timestamptz;
alter table public.leads
  add column if not exists sla_4h_notified_at timestamptz;
alter table public.leads
  add column if not exists sla_overdue_notified_at timestamptz;
alter table public.leads
  add column if not exists sla_owner_notified_at timestamptz;

update public.leads
set first_contact_attempt_at = coalesce(first_contact_attempt_at, last_contact_attempt_at),
    first_successful_contact_at = coalesce(
      first_successful_contact_at,
      first_response_at,
      last_contacted_at
    ),
    contact_attempt_count = greatest(
      coalesce(contact_attempt_count, 0),
      case when last_contact_attempt_at is not null then 1 else 0 end
    ),
    assigned_at = case
      when coalesce(responsible_agent_id, agent_id) is not null
        then coalesce(assigned_at, received_at, now())
      else null
    end,
    first_contact_due_at = case
      when coalesce(responsible_agent_id, agent_id) is not null
        then coalesce(
          first_contact_due_at,
          coalesce(assigned_at, received_at, now()) + interval '24 hours'
        )
      else null
    end;

update public.leads
set contact_sla_status = case
  when coalesce(responsible_agent_id, agent_id) is null then 'unassigned'
  when first_successful_contact_at is not null
    and first_successful_contact_at <= first_contact_due_at then 'met'
  when first_successful_contact_at is not null then 'late'
  when first_contact_due_at <= now() then 'overdue'
  else 'pending'
end
where contact_sla_status is null
   or contact_sla_status not in ('unassigned', 'pending', 'met', 'late', 'overdue');

alter table public.leads alter column contact_sla_status set default 'unassigned';
alter table public.leads alter column contact_sla_status set not null;

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_contact_sla_status_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads add constraint leads_contact_sla_status_check
      check (contact_sla_status in ('unassigned', 'pending', 'met', 'late', 'overdue'))
      not valid;
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_contact_attempt_count_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads add constraint leads_contact_attempt_count_check
      check (contact_attempt_count >= 0)
      not valid;
  end if;
end
$constraints$;

alter table public.leads validate constraint leads_contact_sla_status_check;
alter table public.leads validate constraint leads_contact_attempt_count_check;

create index if not exists leads_contact_sla_queue_idx
  on public.leads(agency_id, contact_sla_status, first_contact_due_at)
  where deleted_at is null;
create index if not exists leads_contact_sla_agent_idx
  on public.leads(agency_id, responsible_agent_id, contact_sla_status, first_contact_due_at)
  where deleted_at is null;

create or replace function public.crm_prepare_lead_contact_sla()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  assignment_changed boolean;
  success_time timestamptz;
begin
  assignment_changed := tg_op = 'INSERT';
  if tg_op = 'UPDATE' then
    assignment_changed :=
      new.responsible_agent_id is distinct from old.responsible_agent_id;
  end if;

  if assignment_changed then
    new.assigned_by_user_id := coalesce(new.assigned_by_user_id, auth.uid());
    if new.responsible_agent_id is null then
      new.assigned_at := null;
      new.first_contact_due_at := null;
      new.contact_sla_status := 'unassigned';
    elsif new.first_successful_contact_at is null
       and new.first_response_at is null
       and new.last_contacted_at is null then
      new.assigned_at := coalesce(new.assigned_at, now());
      new.first_contact_due_at := new.assigned_at + interval '24 hours';
      new.contact_sla_status := 'pending';
      new.sla_12h_notified_at := null;
      new.sla_4h_notified_at := null;
      new.sla_overdue_notified_at := null;
      new.sla_owner_notified_at := null;
    end if;
  end if;

  new.first_contact_attempt_at := coalesce(
    new.first_contact_attempt_at,
    new.last_contact_attempt_at
  );
  success_time := coalesce(
    new.first_successful_contact_at,
    new.first_response_at,
    new.last_contacted_at
  );
  new.first_successful_contact_at := success_time;

  if success_time is not null then
    new.contact_sla_status := case
      when new.first_contact_due_at is not null
        and success_time <= new.first_contact_due_at then 'met'
      else 'late'
    end;
  elsif new.responsible_agent_id is null then
    new.contact_sla_status := 'unassigned';
  elsif new.first_contact_due_at is not null and new.first_contact_due_at <= now() then
    new.contact_sla_status := 'overdue';
  else
    new.contact_sla_status := 'pending';
  end if;

  return new;
end
$function$;

drop trigger if exists zz_crm_prepare_lead_contact_sla_trigger on public.leads;
create trigger zz_crm_prepare_lead_contact_sla_trigger
before insert or update of responsible_agent_id, agent_id, first_response_at,
  last_contacted_at, last_contact_attempt_at, first_successful_contact_at
on public.leads
for each row execute function public.crm_prepare_lead_contact_sla();

create or replace function public.crm_notify_lead_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if new.responsible_agent_id is not distinct from old.responsible_agent_id then
    return new;
  end if;

  if new.responsible_agent_id is null then
    perform public.crm_enqueue_notification(
      new.agency_id,
      null,
      'lead_assignment_required',
      'Lead de alocat',
      coalesce(new.contact_name, 'Un lead') || ' nu are agent responsabil.',
      'lead',
      new.id::text,
      'urgent',
      '/clients',
      'lead-assignment-required:' || new.id::text || ':' ||
        extract(epoch from now())::bigint::text,
      jsonb_build_object('lead_id', new.id)
    );
  else
    perform public.crm_enqueue_notification(
      new.agency_id,
      new.responsible_agent_id,
      'lead_assigned',
      'Lead alocat',
      coalesce(new.contact_name, 'Un client') ||
        ' trebuie contactat în maximum 24 de ore.',
      'lead',
      new.id::text,
      'high',
      '/clients',
      'lead-assigned:' || new.id::text || ':' ||
        new.responsible_agent_id::text || ':' ||
        extract(epoch from coalesce(new.assigned_at, now()))::bigint::text,
      jsonb_build_object(
        'lead_id', new.id,
        'first_contact_due_at', new.first_contact_due_at
      )
    );
  end if;
  return new;
end
$function$;

drop trigger if exists crm_notify_lead_assignment_trigger on public.leads;
create trigger crm_notify_lead_assignment_trigger
after update of responsible_agent_id on public.leads
for each row execute function public.crm_notify_lead_assignment();

create or replace function public.crm_process_contact_sla(
  p_now timestamptz default now(),
  p_agency_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  lead_row record;
  pending_count integer := 0;
  overdue_count integer := 0;
  notified_12h integer := 0;
  notified_4h integer := 0;
  notified_overdue integer := 0;
  notified_owner integer := 0;
begin
  update public.leads lead
  set contact_sla_status = case
    when lead.responsible_agent_id is null then 'unassigned'
    when lead.first_successful_contact_at is not null
      and lead.first_successful_contact_at <= lead.first_contact_due_at then 'met'
    when lead.first_successful_contact_at is not null then 'late'
    when lead.first_contact_due_at <= p_now then 'overdue'
    else 'pending'
  end
  where lead.deleted_at is null
    and (p_agency_id is null or lead.agency_id = p_agency_id)
    and lead.contact_sla_status is distinct from case
      when lead.responsible_agent_id is null then 'unassigned'
      when lead.first_successful_contact_at is not null
        and lead.first_successful_contact_at <= lead.first_contact_due_at then 'met'
      when lead.first_successful_contact_at is not null then 'late'
      when lead.first_contact_due_at <= p_now then 'overdue'
      else 'pending'
    end;

  select count(*) into pending_count
  from public.leads lead
  where lead.deleted_at is null
    and (p_agency_id is null or lead.agency_id = p_agency_id)
    and lead.contact_sla_status = 'pending';
  select count(*) into overdue_count
  from public.leads lead
  where lead.deleted_at is null
    and (p_agency_id is null or lead.agency_id = p_agency_id)
    and lead.contact_sla_status = 'overdue';

  for lead_row in
    update public.leads lead
    set sla_12h_notified_at = p_now
    where lead.deleted_at is null
      and (p_agency_id is null or lead.agency_id = p_agency_id)
      and lead.contact_sla_status = 'pending'
      and lead.responsible_agent_id is not null
      and lead.first_contact_due_at > p_now + interval '4 hours'
      and lead.first_contact_due_at <= p_now + interval '12 hours'
      and lead.sla_12h_notified_at is null
    returning lead.*
  loop
    perform public.crm_enqueue_notification(
      lead_row.agency_id,
      lead_row.responsible_agent_id,
      'lead_sla_12h',
      'Mai sunt 12 ore pentru contact',
      coalesce(lead_row.contact_name, 'Clientul') || ' trebuie contactat în termen.',
      'lead',
      lead_row.id::text,
      'high',
      '/clients',
      'lead-sla-12h:' || lead_row.id::text || ':' ||
        extract(epoch from lead_row.first_contact_due_at)::bigint::text,
      jsonb_build_object('first_contact_due_at', lead_row.first_contact_due_at)
    );
    notified_12h := notified_12h + 1;
  end loop;

  for lead_row in
    update public.leads lead
    set sla_4h_notified_at = p_now
    where lead.deleted_at is null
      and (p_agency_id is null or lead.agency_id = p_agency_id)
      and lead.contact_sla_status = 'pending'
      and lead.responsible_agent_id is not null
      and lead.first_contact_due_at > p_now
      and lead.first_contact_due_at <= p_now + interval '4 hours'
      and lead.sla_4h_notified_at is null
    returning lead.*
  loop
    perform public.crm_enqueue_notification(
      lead_row.agency_id,
      lead_row.responsible_agent_id,
      'lead_sla_4h',
      'Mai sunt 4 ore pentru contact',
      coalesce(lead_row.contact_name, 'Clientul') || ' se apropie de termenul de contact.',
      'lead',
      lead_row.id::text,
      'urgent',
      '/clients',
      'lead-sla-4h:' || lead_row.id::text || ':' ||
        extract(epoch from lead_row.first_contact_due_at)::bigint::text,
      jsonb_build_object('first_contact_due_at', lead_row.first_contact_due_at)
    );
    notified_4h := notified_4h + 1;
  end loop;

  for lead_row in
    update public.leads lead
    set sla_overdue_notified_at = p_now
    where lead.deleted_at is null
      and (p_agency_id is null or lead.agency_id = p_agency_id)
      and lead.contact_sla_status = 'overdue'
      and lead.responsible_agent_id is not null
      and lead.sla_overdue_notified_at is null
    returning lead.*
  loop
    perform public.crm_enqueue_notification(
      lead_row.agency_id,
      lead_row.responsible_agent_id,
      'lead_sla_overdue',
      'Contact întârziat',
      coalesce(lead_row.contact_name, 'Clientul') || ' a depășit termenul de 24 de ore.',
      'lead',
      lead_row.id::text,
      'urgent',
      '/clients',
      'lead-sla-overdue:' || lead_row.id::text || ':' ||
        extract(epoch from lead_row.first_contact_due_at)::bigint::text,
      jsonb_build_object('first_contact_due_at', lead_row.first_contact_due_at)
    );
    notified_overdue := notified_overdue + 1;
  end loop;

  for lead_row in
    update public.leads lead
    set sla_owner_notified_at = p_now
    where lead.deleted_at is null
      and (p_agency_id is null or lead.agency_id = p_agency_id)
      and lead.contact_sla_status = 'overdue'
      and lead.sla_owner_notified_at is null
    returning lead.*
  loop
    perform public.crm_enqueue_notification(
      lead_row.agency_id,
      null,
      'lead_sla_overdue_owner',
      'Lead necontactat în 24 de ore',
      coalesce(lead_row.contact_name, 'Un client') || ' necesită verificarea managerului.',
      'lead',
      lead_row.id::text,
      'urgent',
      '/clients',
      'lead-sla-overdue-owner:' || lead_row.id::text || ':' ||
        extract(epoch from lead_row.first_contact_due_at)::bigint::text,
      jsonb_build_object(
        'responsible_agent_id', lead_row.responsible_agent_id,
        'first_contact_due_at', lead_row.first_contact_due_at
      )
    );
    notified_owner := notified_owner + 1;
  end loop;

  return jsonb_build_object(
    'processed_at', p_now,
    'timezone', 'Europe/Bucharest',
    'pending', pending_count,
    'overdue', overdue_count,
    'notified_12h', notified_12h,
    'notified_4h', notified_4h,
    'notified_overdue', notified_overdue,
    'notified_owner', notified_owner
  );
end
$function$;

create or replace function public.crm_contact_sla_dashboard(
  p_agency_id uuid,
  p_user_id uuid,
  p_scope_all boolean,
  p_from timestamptz,
  p_to timestamptz
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  overall jsonb;
  agents jsonb;
begin
  if p_agency_id is null or p_user_id is null
     or not exists (
       select 1
       from public.profiles profile
       where profile.agency_id = p_agency_id
         and profile.user_id = p_user_id
         and coalesce(profile.status, 'active') = 'active'
     ) then
    raise exception 'sla_dashboard_forbidden';
  end if;

  with scoped as (
    select lead.*
    from public.leads lead
    where lead.agency_id = p_agency_id
      and lead.deleted_at is null
      and (p_scope_all or lead.responsible_agent_id = p_user_id)
  )
  select jsonb_build_object(
    'new_requests', count(*) filter (
      where received_at >= p_from and received_at < p_to
    ),
    'assigned', count(*) filter (
      where assigned_at >= p_from and assigned_at < p_to
    ),
    'contacted_on_time', count(*) filter (
      where assigned_at >= p_from and assigned_at < p_to
        and first_successful_contact_at is not null
        and first_successful_contact_at <= first_contact_due_at
    ),
    'contacted_late', count(*) filter (
      where assigned_at >= p_from and assigned_at < p_to
        and first_successful_contact_at > first_contact_due_at
    ),
    'uncontacted', count(*) filter (
      where assigned_at >= p_from and assigned_at < p_to
        and first_successful_contact_at is null
    ),
    'average_first_contact_minutes', coalesce(round(avg(
      extract(epoch from (first_successful_contact_at - assigned_at)) / 60
    ) filter (
      where assigned_at >= p_from and assigned_at < p_to
        and first_successful_contact_at is not null
    ), 1), 0),
    'due_today', count(*) filter (
      where first_successful_contact_at is null
        and first_contact_due_at is not null
        and (first_contact_due_at at time zone 'Europe/Bucharest')::date =
          (p_to at time zone 'Europe/Bucharest')::date
    ),
    'overdue', count(*) filter (
      where first_successful_contact_at is null
        and first_contact_due_at < p_to
    ),
    'missing_description', count(*) filter (
      where first_successful_contact_at is null
        and contact_outcome is null
    ),
    'missing_next_action', count(*) filter (
      where coalesce(pipeline_stage, 'lead_nou') not in ('finalizat', 'pierdut')
        and next_action_at is null
    ),
    'sla_percent', coalesce(round(
      100.0 * count(*) filter (
        where assigned_at >= p_from and assigned_at < p_to
          and first_successful_contact_at is not null
          and first_successful_contact_at <= first_contact_due_at
      ) / nullif(count(*) filter (
        where assigned_at >= p_from and assigned_at < p_to
      ), 0),
      1
    ), 0)
  ) into overall
  from scoped;

  with agent_metrics as (
    select
      profile.user_id,
      coalesce(nullif(profile.full_name, ''), profile.user_id::text) as name,
      profile.role,
      count(lead.id) filter (
        where lead.assigned_at >= p_from and lead.assigned_at < p_to
      ) as assigned,
      count(lead.id) filter (
        where lead.assigned_at >= p_from and lead.assigned_at < p_to
          and lead.first_successful_contact_at is not null
          and lead.first_successful_contact_at <= lead.first_contact_due_at
      ) as contacted_on_time,
      count(lead.id) filter (
        where lead.assigned_at >= p_from and lead.assigned_at < p_to
          and lead.first_successful_contact_at > lead.first_contact_due_at
      ) as contacted_late,
      count(lead.id) filter (
        where lead.assigned_at >= p_from and lead.assigned_at < p_to
          and lead.first_successful_contact_at is null
      ) as uncontacted,
      coalesce(round(avg(
        extract(epoch from (lead.first_successful_contact_at - lead.assigned_at)) / 60
      ) filter (
        where lead.assigned_at >= p_from and lead.assigned_at < p_to
          and lead.first_successful_contact_at is not null
      ), 1), 0) as average_first_contact_minutes
    from public.profiles profile
    left join public.leads lead
      on lead.agency_id = profile.agency_id
      and lead.responsible_agent_id = profile.user_id
      and lead.deleted_at is null
    where profile.agency_id = p_agency_id
      and coalesce(profile.status, 'active') = 'active'
      and coalesce(profile.role, 'viewer') in ('owner', 'admin', 'manager', 'agent')
    group by profile.user_id, profile.full_name, profile.role
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'user_id', user_id,
    'name', name,
    'role', role,
    'assigned', assigned,
    'contacted_on_time', contacted_on_time,
    'contacted_late', contacted_late,
    'uncontacted', uncontacted,
    'average_first_contact_minutes', average_first_contact_minutes,
    'sla_percent', case
      when assigned = 0 then 0
      else round(100.0 * contacted_on_time / assigned, 1)
    end
  ) order by name), '[]'::jsonb)
  into agents
  from agent_metrics;

  return jsonb_build_object(
    'timezone', 'Europe/Bucharest',
    'overall', overall,
    'agents', agents
  );
end
$function$;

revoke all on function public.crm_prepare_lead_contact_sla() from public, anon, authenticated;
revoke all on function public.crm_notify_lead_assignment() from public, anon, authenticated;
revoke all on function public.crm_process_contact_sla(timestamptz, uuid)
  from public, anon, authenticated;
revoke all on function public.crm_contact_sla_dashboard(uuid, uuid, boolean, timestamptz, timestamptz)
  from public, anon, authenticated;
grant execute on function public.crm_prepare_lead_contact_sla() to service_role;
grant execute on function public.crm_notify_lead_assignment() to service_role;
grant execute on function public.crm_process_contact_sla(timestamptz, uuid) to service_role;
grant execute on function public.crm_contact_sla_dashboard(uuid, uuid, boolean, timestamptz, timestamptz)
  to service_role;

commit;
