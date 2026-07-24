-- Operational extension 10: exact, tenant-scoped weekly reports.
-- Aggregation runs in PostgreSQL and stores the contributing record set for
-- every metric. No API list limit is involved in the calculation.

begin;

create table if not exists public.agency_weekly_report_settings (
  agency_id uuid primary key references public.agencies(id) on delete cascade,
  enabled boolean not null default true,
  weekday smallint not null default 5 check (weekday between 0 and 6),
  local_time time not null default '18:00',
  timezone text not null default 'Europe/Bucharest'
    check (timezone = 'Europe/Bucharest'),
  include_pdf boolean not null default true,
  last_scheduled_period_end timestamptz,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);

create table if not exists public.weekly_reports (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  period_start timestamptz not null,
  period_end timestamptz not null,
  timezone text not null default 'Europe/Bucharest',
  status text not null default 'generating',
  generation_version integer not null default 1 check (generation_version > 0),
  general_metrics jsonb not null default '{}'::jsonb,
  agent_metrics jsonb not null default '[]'::jsonb,
  metric_definitions jsonb not null default '{}'::jsonb,
  generated_at timestamptz,
  generated_by uuid references auth.users(id),
  email_status text not null default 'not_requested',
  email_recipient text,
  email_provider_message_id text,
  email_attempt_count integer not null default 0 check (email_attempt_count between 0 and 20),
  email_send_generation integer not null default 1 check (email_send_generation > 0),
  email_last_attempt_at timestamptz,
  email_next_retry_at timestamptz,
  email_accepted_at timestamptz,
  email_last_error text,
  email_lock_token uuid,
  email_locked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_reports_period_check check (
    period_end > period_start
    and period_end - period_start <= interval '32 days'
  ),
  constraint weekly_reports_status_check check (
    status in ('generating', 'ready', 'failed')
  ),
  constraint weekly_reports_email_status_check check (
    email_status in (
      'not_requested', 'blocked_unverified', 'queued', 'retrying',
      'sending', 'accepted', 'failed'
    )
  ),
  unique(agency_id, period_start, period_end)
);

create table if not exists public.weekly_report_records (
  id bigint generated always as identity primary key,
  report_id uuid not null references public.weekly_reports(id) on delete cascade,
  agency_id uuid not null references public.agencies(id) on delete cascade,
  metric_code text not null,
  entity_type text not null,
  entity_id uuid not null,
  agent_id uuid references auth.users(id),
  occurred_at timestamptz,
  label text,
  details jsonb not null default '{}'::jsonb
);

create index if not exists weekly_reports_archive_idx
  on public.weekly_reports(agency_id, period_end desc);
create index if not exists weekly_reports_retry_idx
  on public.weekly_reports(email_status, email_next_retry_at)
  where email_status in ('queued', 'retrying');
create index if not exists weekly_report_records_metric_idx
  on public.weekly_report_records(report_id, metric_code, id);
create index if not exists weekly_report_records_agent_idx
  on public.weekly_report_records(report_id, agent_id, metric_code);

insert into public.agency_weekly_report_settings(agency_id)
select agency.id from public.agencies agency
on conflict(agency_id) do nothing;

create or replace function public.crm_seed_weekly_report_settings()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  insert into public.agency_weekly_report_settings(agency_id)
  values (new.id)
  on conflict(agency_id) do nothing;
  return new;
end
$function$;

drop trigger if exists crm_seed_weekly_report_settings_trigger on public.agencies;
create trigger crm_seed_weekly_report_settings_trigger
after insert on public.agencies
for each row execute function public.crm_seed_weekly_report_settings();

create or replace function public.crm_generate_weekly_report(
  p_agency_id uuid,
  p_period_start timestamptz,
  p_period_end timestamptz,
  p_requested_by uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  v_report_id uuid;
  counts jsonb;
  general jsonb;
  agents jsonb;
begin
  if p_agency_id is null or p_period_start is null or p_period_end is null
     or p_period_end <= p_period_start
     or p_period_end - p_period_start > interval '32 days' then
    raise exception 'invalid_weekly_report_period';
  end if;
  if not exists (select 1 from public.agencies where id = p_agency_id) then
    raise exception 'weekly_report_agency_not_found';
  end if;
  if p_requested_by is not null and not exists (
    select 1 from public.profiles
    where agency_id = p_agency_id
      and user_id = p_requested_by
      and coalesce(status, 'active') = 'active'
  ) then
    raise exception 'weekly_report_actor_outside_agency';
  end if;

  insert into public.weekly_reports(
    agency_id, period_start, period_end, status, generated_by,
    generated_at, updated_at
  ) values (
    p_agency_id, p_period_start, p_period_end, 'generating',
    p_requested_by, null, now()
  )
  on conflict(agency_id, period_start, period_end) do update set
    status = 'generating',
    generation_version = public.weekly_reports.generation_version + 1,
    generated_by = excluded.generated_by,
    generated_at = null,
    updated_at = now(),
    email_status = 'not_requested',
    email_send_generation = 1,
    email_provider_message_id = null,
    email_accepted_at = null,
    email_lock_token = null,
    email_locked_at = null,
    email_next_retry_at = null,
    email_last_error = null
  returning id into v_report_id;

  delete from public.weekly_report_records
  where report_id = v_report_id;

  insert into public.weekly_report_records(
    report_id, agency_id, metric_code, entity_type, entity_id,
    agent_id, occurred_at, label
  )
  select v_report_id, p_agency_id, 'new_leads', 'lead', lead.id,
    coalesce(lead.responsible_agent_id, lead.agent_id), lead.received_at,
    coalesce(nullif(lead.contact_name, ''), 'Lead fără nume')
  from public.leads lead
  where lead.agency_id = p_agency_id
    and lead.deleted_at is null
    and lead.received_at >= p_period_start
    and lead.received_at < p_period_end;

  insert into public.weekly_report_records(
    report_id, agency_id, metric_code, entity_type, entity_id,
    agent_id, occurred_at, label
  )
  select v_report_id, p_agency_id, 'allocated_demands', 'demand', demand.id,
    demand.agent_id, demand.created_at,
    coalesce(nullif(demand.internal_code, ''), 'Cerere')
  from public.demands demand
  where demand.agency_id = p_agency_id
    and demand.deleted_at is null
    and demand.agent_id is not null
    and demand.created_at >= p_period_start
    and demand.created_at < p_period_end;

  insert into public.weekly_report_records(
    report_id, agency_id, metric_code, entity_type, entity_id,
    agent_id, occurred_at, label, details
  )
  select v_report_id, p_agency_id,
    case
      when lead.first_successful_contact_at is null then 'uncontacted'
      when lead.first_successful_contact_at <= lead.first_contact_due_at
        then 'contacted_in_24h'
      else 'contacted_late'
    end,
    'lead', lead.id, coalesce(lead.responsible_agent_id, lead.agent_id),
    lead.assigned_at, coalesce(nullif(lead.contact_name, ''), 'Lead fără nume'),
    jsonb_build_object(
      'assigned_at', lead.assigned_at,
      'due_at', lead.first_contact_due_at,
      'first_successful_contact_at', lead.first_successful_contact_at
    )
  from public.leads lead
  where lead.agency_id = p_agency_id
    and lead.deleted_at is null
    and lead.assigned_at >= p_period_start
    and lead.assigned_at < p_period_end;

  insert into public.weekly_report_records(
    report_id, agency_id, metric_code, entity_type, entity_id,
    agent_id, occurred_at, label, details
  )
  select v_report_id, p_agency_id, metric.metric_code,
    'lead', lead.id, coalesce(lead.responsible_agent_id, lead.agent_id),
    lead.assigned_at, coalesce(nullif(lead.contact_name, ''), 'Lead fără nume'),
    jsonb_build_object(
      'assigned_at', lead.assigned_at,
      'first_successful_contact_at', lead.first_successful_contact_at,
      'response_minutes', case
        when lead.first_successful_contact_at is null then null
        else round(extract(epoch from (
          lead.first_successful_contact_at - lead.assigned_at
        )) / 60.0, 1)
      end
    )
  from public.leads lead
  cross join lateral (
    values
      ('assigned_leads'),
      (case when lead.first_successful_contact_at is not null
        then 'contacted_leads' end),
      (case when lead.first_successful_contact_at is not null
        then 'average_response_samples' end)
  ) metric(metric_code)
  where lead.agency_id = p_agency_id
    and lead.deleted_at is null
    and lead.assigned_at >= p_period_start
    and lead.assigned_at < p_period_end
    and metric.metric_code is not null;

  insert into public.weekly_report_records(
    report_id, agency_id, metric_code, entity_type, entity_id,
    agent_id, occurred_at, label
  )
  select v_report_id, p_agency_id, 'activities_missing_description',
    'activity', activity.id, coalesce(activity.agent_id, activity.user_id),
    activity.created_at, coalesce(nullif(activity.title, ''), 'Activitate')
  from public.activities activity
  where activity.agency_id = p_agency_id
    and activity.created_at >= p_period_start
    and activity.created_at < p_period_end
    and nullif(trim(activity.description), '') is null;

  insert into public.weekly_report_records(
    report_id, agency_id, metric_code, entity_type, entity_id,
    agent_id, occurred_at, label
  )
  select v_report_id, p_agency_id, 'demands_missing_next_action',
    'demand', demand.id, demand.agent_id,
    coalesce(demand.updated_at, demand.created_at),
    coalesce(nullif(demand.internal_code, ''), 'Cerere')
  from public.demands demand
  where demand.agency_id = p_agency_id
    and demand.deleted_at is null
    and demand.status in ('activa', 'inactiva', 'de_verificat_inchidere')
    and demand.next_action_at is null;

  insert into public.weekly_report_records(
    report_id, agency_id, metric_code, entity_type, entity_id,
    agent_id, occurred_at, label
  )
  select v_report_id, p_agency_id, 'active_demands',
    'demand', demand.id, demand.agent_id,
    coalesce(demand.updated_at, demand.created_at),
    coalesce(nullif(demand.internal_code, ''), 'Cerere')
  from public.demands demand
  where demand.agency_id = p_agency_id
    and demand.deleted_at is null
    and demand.status in ('activa', 'inactiva', 'de_verificat_inchidere');

  insert into public.weekly_report_records(
    report_id, agency_id, metric_code, entity_type, entity_id,
    agent_id, occurred_at, label
  )
  select v_report_id, p_agency_id, 'demands_over_20_days',
    'demand', demand.id, demand.agent_id,
    coalesce(demand.review_due_at, demand.updated_at, demand.created_at),
    coalesce(nullif(demand.internal_code, ''), 'Cerere')
  from public.demands demand
  where demand.agency_id = p_agency_id
    and demand.deleted_at is null
    and demand.status in ('activa', 'inactiva', 'de_verificat_inchidere')
    and coalesce(
      demand.last_relevant_activity_at,
      demand.updated_at,
      demand.created_at
    ) <= p_period_end - interval '20 days';

  insert into public.weekly_report_records(
    report_id, agency_id, metric_code, entity_type, entity_id,
    agent_id, occurred_at, label
  )
  select v_report_id, p_agency_id, 'demands_closed',
    'demand', demand.id, demand.agent_id, demand.closed_at,
    coalesce(nullif(demand.internal_code, ''), 'Cerere')
  from public.demands demand
  where demand.agency_id = p_agency_id
    and demand.deleted_at is null
    and demand.closed_at >= p_period_start
    and demand.closed_at < p_period_end;

  insert into public.weekly_report_records(
    report_id, agency_id, metric_code, entity_type, entity_id,
    agent_id, occurred_at, label
  )
  select v_report_id, p_agency_id, 'demands_should_close',
    'demand', demand.id, demand.agent_id, demand.review_marked_at,
    coalesce(nullif(demand.internal_code, ''), 'Cerere')
  from public.demands demand
  where demand.agency_id = p_agency_id
    and demand.deleted_at is null
    and demand.status = 'de_verificat_inchidere';

  insert into public.weekly_report_records(
    report_id, agency_id, metric_code, entity_type, entity_id,
    agent_id, occurred_at, label
  )
  select v_report_id, p_agency_id, 'viewings_scheduled',
    'viewing', event.id, event.agent_id, event.start_at,
    coalesce(nullif(event.title, ''), 'Vizionare')
  from public.calendar_events event
  where event.agency_id = p_agency_id
    and event.deleted_at is null
    and event.type in ('vizionare', 'viewing')
    and event.status not in ('anulata', 'cancelled')
    and event.start_at >= p_period_start
    and event.start_at < p_period_end;

  insert into public.weekly_report_records(
    report_id, agency_id, metric_code, entity_type, entity_id,
    agent_id, occurred_at, label
  )
  select v_report_id, p_agency_id, 'viewings_completed',
    'viewing', event.id, event.agent_id,
    coalesce(event.completed_at, event.start_at),
    coalesce(nullif(event.title, ''), 'Vizionare')
  from public.calendar_events event
  where event.agency_id = p_agency_id
    and event.deleted_at is null
    and event.type in ('vizionare', 'viewing')
    and (
      event.completed = true
      or event.status in ('efectuata', 'completed', 'finalizata')
      or event.completed_at is not null
    )
    and coalesce(event.completed_at, event.start_at) >= p_period_start
    and coalesce(event.completed_at, event.start_at) < p_period_end;

  insert into public.weekly_report_records(
    report_id, agency_id, metric_code, entity_type, entity_id,
    occurred_at, label, details
  )
  select v_report_id, p_agency_id, 'storia_unmatched',
    'portal_unmatched_message', message.id, message.created_at,
    coalesce(nullif(message.sender_name, ''), 'Mesaj Storia'),
    jsonb_build_object('reason', message.reason, 'portal_ad_id', message.portal_ad_id)
  from public.portal_unmatched_messages message
  where message.agency_id = p_agency_id
    and message.portal = 'storia'
    and message.status = 'pending'
    and message.created_at < p_period_end;

  insert into public.weekly_report_records(
    report_id, agency_id, metric_code, entity_type, entity_id,
    agent_id, occurred_at, label
  )
  select v_report_id, p_agency_id, 'storia_unmatched',
    'lead', lead.id, coalesce(lead.responsible_agent_id, lead.agent_id),
    lead.received_at, coalesce(nullif(lead.contact_name, ''), 'Lead Storia')
  from public.leads lead
  where lead.agency_id = p_agency_id
    and lead.deleted_at is null
    and lead.property_id is null
    and lead.association_status = 'pending'
    and lead.source_normalized in ('storia', 'storia_olx')
    and lead.received_at < p_period_end;

  insert into public.weekly_report_records(
    report_id, agency_id, metric_code, entity_type, entity_id,
    occurred_at, label
  )
  select v_report_id, p_agency_id, 'active_properties_unassigned',
    'property', property.id, property.updated_at,
    coalesce(nullif(property.internal_code, ''), nullif(property.title, ''), 'Proprietate')
  from public.properties property
  where property.agency_id = p_agency_id
    and property.deleted_at is null
    and property.status = 'activa'
    and coalesce(property.responsible_agent_id, property.agent_id) is null;

  insert into public.weekly_report_records(
    report_id, agency_id, metric_code, entity_type, entity_id,
    agent_id, occurred_at, label
  )
  select v_report_id, p_agency_id, 'overdue_tasks',
    'task', task.id, task.assigned_to, task.due_at,
    coalesce(nullif(task.title, ''), 'Task')
  from public.tasks task
  where task.agency_id = p_agency_id
    and coalesce(task.status, 'open') not in (
      'done', 'completed', 'closed', 'cancelled', 'anulat', 'finalizat'
    )
    and task.due_at is not null
    and task.due_at < p_period_end;

  insert into public.weekly_report_records(
    report_id, agency_id, metric_code, entity_type, entity_id,
    agent_id, occurred_at, label
  )
  select v_report_id, p_agency_id, 'offers',
    'lead', event.lead_id, coalesce(lead.responsible_agent_id, lead.agent_id),
    event.created_at, coalesce(nullif(lead.contact_name, ''), 'Lead ofertă')
  from public.lead_pipeline_events event
  join public.leads lead
    on lead.id = event.lead_id and lead.agency_id = event.agency_id
  where event.agency_id = p_agency_id
    and event.to_stage = 'oferta'
    and event.created_at >= p_period_start
    and event.created_at < p_period_end;

  insert into public.weekly_report_records(
    report_id, agency_id, metric_code, entity_type, entity_id,
    agent_id, occurred_at, label
  )
  select v_report_id, p_agency_id, 'transactions',
    'transaction', transaction_row.id, transaction_row.agent_id,
    coalesce(transaction_row.completed_at, transaction_row.created_at),
    'Tranzacție'
  from public.transactions transaction_row
  where transaction_row.agency_id = p_agency_id
    and transaction_row.deleted_at is null
    and transaction_row.status = 'finalizata'
    and coalesce(transaction_row.completed_at, transaction_row.created_at) >= p_period_start
    and coalesce(transaction_row.completed_at, transaction_row.created_at) < p_period_end;

  select coalesce(jsonb_object_agg(metric_code, metric_count), '{}'::jsonb)
  into counts
  from (
    select metric_code, count(*)::integer as metric_count
    from public.weekly_report_records record
    where record.report_id = v_report_id
    group by metric_code
  ) grouped;

  general := jsonb_build_object(
    'new_leads', 0,
    'allocated_demands', 0,
    'contacted_in_24h', 0,
    'contacted_late', 0,
    'uncontacted', 0,
    'average_first_contact_minutes', coalesce((
      select round(avg(extract(epoch from (
        lead.first_successful_contact_at - lead.assigned_at
      )) / 60.0)::numeric, 1)
      from public.leads lead
      where lead.agency_id = p_agency_id
        and lead.deleted_at is null
        and lead.assigned_at >= p_period_start
        and lead.assigned_at < p_period_end
        and lead.first_successful_contact_at is not null
        and lead.first_successful_contact_at >= lead.assigned_at
    ), 0),
    'activities_missing_description', 0,
    'demands_missing_next_action', 0,
    'demands_over_20_days', 0,
    'demands_closed', 0,
    'demands_should_close', 0,
    'viewings_scheduled', 0,
    'viewings_completed', 0,
    'storia_unmatched', 0,
    'active_properties_unassigned', 0,
    'overdue_tasks', 0
  ) || counts;

  select coalesce(jsonb_agg(jsonb_build_object(
    'agent_id', profile.user_id,
    'agent_name', coalesce(nullif(profile.full_name, ''), profile.user_id::text),
    'role', profile.role,
    'assigned_leads', (
      select count(*) from public.weekly_report_records record
      where record.report_id = v_report_id
        and record.agent_id = profile.user_id
        and record.metric_code in ('contacted_in_24h', 'contacted_late', 'uncontacted')
    ),
    'contacted_leads', (
      select count(*) from public.weekly_report_records record
      where record.report_id = v_report_id
        and record.agent_id = profile.user_id
        and record.metric_code in ('contacted_in_24h', 'contacted_late')
    ),
    'sla_percent', coalesce((
      select round(100.0 * count(*) filter (
        where record.metric_code = 'contacted_in_24h'
      ) / nullif(count(*) filter (
        where record.metric_code in ('contacted_in_24h', 'contacted_late', 'uncontacted')
      ), 0), 1)
      from public.weekly_report_records record
      where record.report_id = v_report_id
        and record.agent_id = profile.user_id
    ), 0),
    'average_response_minutes', coalesce((
      select round(avg(extract(epoch from (
        lead.first_successful_contact_at - lead.assigned_at
      )) / 60.0)::numeric, 1)
      from public.leads lead
      where lead.agency_id = p_agency_id
        and coalesce(lead.responsible_agent_id, lead.agent_id) = profile.user_id
        and lead.deleted_at is null
        and lead.assigned_at >= p_period_start
        and lead.assigned_at < p_period_end
        and lead.first_successful_contact_at is not null
        and lead.first_successful_contact_at >= lead.assigned_at
    ), 0),
    'active_demands', (
      select count(*) from public.demands demand
      where demand.agency_id = p_agency_id
        and demand.agent_id = profile.user_id
        and demand.deleted_at is null
        and demand.status in ('activa', 'inactiva', 'de_verificat_inchidere')
    ),
    'demands_over_20_days', (
      select count(*) from public.weekly_report_records record
      where record.report_id = v_report_id
        and record.agent_id = profile.user_id
        and record.metric_code = 'demands_over_20_days'
    ),
    'demands_closed', (
      select count(*) from public.weekly_report_records record
      where record.report_id = v_report_id
        and record.agent_id = profile.user_id
        and record.metric_code = 'demands_closed'
    ),
    'demands_not_closed', (
      select count(*) from public.weekly_report_records record
      where record.report_id = v_report_id
        and record.agent_id = profile.user_id
        and record.metric_code = 'demands_should_close'
    ),
    'activities_missing_description', (
      select count(*) from public.weekly_report_records record
      where record.report_id = v_report_id
        and record.agent_id = profile.user_id
        and record.metric_code = 'activities_missing_description'
    ),
    'viewings', (
      select count(*) from public.weekly_report_records record
      where record.report_id = v_report_id
        and record.agent_id = profile.user_id
        and record.metric_code = 'viewings_scheduled'
    ),
    'offers', (
      select count(*) from public.weekly_report_records record
      where record.report_id = v_report_id
        and record.agent_id = profile.user_id
        and record.metric_code = 'offers'
    ),
    'transactions', (
      select count(*) from public.weekly_report_records record
      where record.report_id = v_report_id
        and record.agent_id = profile.user_id
        and record.metric_code = 'transactions'
    ),
    'overdue_tasks', (
      select count(*) from public.weekly_report_records record
      where record.report_id = v_report_id
        and record.agent_id = profile.user_id
        and record.metric_code = 'overdue_tasks'
    )
  ) order by coalesce(profile.full_name, profile.user_id::text)), '[]'::jsonb)
  into agents
  from public.profiles profile
  where profile.agency_id = p_agency_id
    and coalesce(profile.status, 'active') = 'active'
    and profile.role in ('owner', 'admin', 'manager', 'agent_senior', 'agent');

  update public.weekly_reports
  set status = 'ready',
      general_metrics = general,
      agent_metrics = agents,
      metric_definitions = jsonb_build_object(
        'new_leads', 'Leaduri primite în perioadă',
        'allocated_demands', 'Cereri create și alocate în perioadă',
        'contacted_in_24h', 'Leaduri alocate în perioadă și contactate în termen',
        'contacted_late', 'Leaduri alocate în perioadă și contactate după termen',
        'uncontacted', 'Leaduri alocate în perioadă fără contact reușit',
        'average_first_contact_minutes', 'Minute medii de la alocare la primul contact reușit',
        'activities_missing_description', 'Activități create în perioadă fără descriere',
        'demands_missing_next_action', 'Cereri active fără următoarea acțiune la generare',
        'demands_over_20_days', 'Cereri active cu minimum 20 zile fără activitate relevantă',
        'demands_closed', 'Cereri închise în perioadă',
        'demands_should_close', 'Cereri aflate în verificare pentru închidere la generare',
        'viewings_scheduled', 'Vizionări din perioada raportului, neanulate',
        'viewings_completed', 'Vizionări finalizate în perioada raportului',
        'storia_unmatched', 'Mesaje sau leaduri Storia încă neasociate la generare',
        'active_properties_unassigned', 'Proprietăți active fără agent la generare',
        'overdue_tasks', 'Taskuri nefinalizate cu termen anterior finalului perioadei'
      ),
      generated_at = now(),
      updated_at = now()
  where id = v_report_id and agency_id = p_agency_id;

  return v_report_id;
exception when others then
  if v_report_id is not null then
    update public.weekly_reports
    set status = 'failed', updated_at = now()
    where id = v_report_id and agency_id = p_agency_id;
  end if;
  raise;
end
$function$;

create or replace function public.crm_claim_weekly_report_emails(
  p_now timestamptz,
  p_lock_token uuid,
  p_limit integer default 10
)
returns setof public.weekly_reports
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if p_lock_token is null then
    raise exception 'weekly_report_lock_token_required';
  end if;
  return query
  with candidates as (
    select report.id
    from public.weekly_reports report
    where (
      report.email_status in ('queued', 'retrying')
      and coalesce(report.email_next_retry_at, p_now) <= p_now
    ) or (
      report.email_status = 'sending'
      and report.email_locked_at < p_now - interval '20 minutes'
    )
    order by coalesce(report.email_next_retry_at, report.created_at), report.id
    for update skip locked
    limit greatest(1, least(coalesce(p_limit, 10), 50))
  )
  update public.weekly_reports report
  set email_status = 'sending',
      email_lock_token = p_lock_token,
      email_locked_at = p_now,
      email_last_attempt_at = p_now,
      email_attempt_count = report.email_attempt_count + 1,
      updated_at = p_now
  from candidates
  where report.id = candidates.id
  returning report.*;
end
$function$;

alter table public.agency_weekly_report_settings enable row level security;
alter table public.weekly_reports enable row level security;
alter table public.weekly_report_records enable row level security;

drop policy if exists agency_weekly_report_settings_read
  on public.agency_weekly_report_settings;
create policy agency_weekly_report_settings_read
on public.agency_weekly_report_settings for select to authenticated
using (
  agency_id = public.current_crm_agency_id()
  and public.crm_has_permission('reports', 'view')
);
drop policy if exists agency_weekly_report_settings_manage
  on public.agency_weekly_report_settings;
create policy agency_weekly_report_settings_manage
on public.agency_weekly_report_settings for all to authenticated
using (
  agency_id = public.current_crm_agency_id()
  and public.crm_has_permission('settings', 'edit')
)
with check (
  agency_id = public.current_crm_agency_id()
  and public.crm_has_permission('settings', 'edit')
);

drop policy if exists weekly_reports_read on public.weekly_reports;
create policy weekly_reports_read on public.weekly_reports
for select to authenticated
using (
  agency_id = public.current_crm_agency_id()
  and public.crm_has_permission('reports', 'view')
);
drop policy if exists weekly_report_records_read on public.weekly_report_records;
create policy weekly_report_records_read on public.weekly_report_records
for select to authenticated
using (
  agency_id = public.current_crm_agency_id()
  and public.crm_has_permission('reports', 'view')
  and exists (
    select 1 from public.weekly_reports report
    where report.id = weekly_report_records.report_id
      and report.agency_id = weekly_report_records.agency_id
  )
);

grant select on public.agency_weekly_report_settings,
  public.weekly_reports, public.weekly_report_records to authenticated;
grant insert, update on public.agency_weekly_report_settings to authenticated;
grant all on public.agency_weekly_report_settings,
  public.weekly_reports, public.weekly_report_records to service_role;
grant usage, select on sequence public.weekly_report_records_id_seq to service_role;

revoke all on function public.crm_generate_weekly_report(
  uuid, timestamptz, timestamptz, uuid
) from public, anon, authenticated;
revoke all on function public.crm_seed_weekly_report_settings()
  from public, anon, authenticated;
revoke all on function public.crm_claim_weekly_report_emails(
  timestamptz, uuid, integer
) from public, anon, authenticated;
grant execute on function public.crm_generate_weekly_report(
  uuid, timestamptz, timestamptz, uuid
) to service_role;
grant execute on function public.crm_seed_weekly_report_settings()
  to service_role;
grant execute on function public.crm_claim_weekly_report_emails(
  timestamptz, uuid, integer
) to service_role;

comment on table public.weekly_report_records is
  'Exact drill-down evidence used to calculate every count; never API-capped.';

commit;
