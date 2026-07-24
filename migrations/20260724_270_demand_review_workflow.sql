-- Operational extension 6: a 20-day threshold starts a human review.
-- It never closes or deletes a demand automatically.

begin;

alter table public.demands
  add column if not exists created_at timestamptz not null default now();
alter table public.demands
  add column if not exists last_relevant_activity_at timestamptz;
alter table public.demands
  add column if not exists review_due_at timestamptz;
alter table public.demands
  add column if not exists review_marked_at timestamptz;
alter table public.demands
  add column if not exists review_notified_at timestamptz;
alter table public.demands
  add column if not exists review_count integer not null default 0;
alter table public.demands
  add column if not exists review_blockers_snapshot jsonb not null default '[]'::jsonb;
alter table public.demands
  add column if not exists next_action_type text;
alter table public.demands
  add column if not exists next_action_at timestamptz;
alter table public.demands
  add column if not exists contact_after_at timestamptz;
alter table public.demands
  add column if not exists close_reason_code text;
alter table public.demands
  add column if not exists close_reason_note text;
alter table public.demands
  add column if not exists closed_at timestamptz;
alter table public.demands
  add column if not exists closed_by uuid references auth.users(id);
alter table public.demands
  add column if not exists reopened_at timestamptz;
alter table public.demands
  add column if not exists reopened_by uuid references auth.users(id);

alter table public.calendar_events
  add column if not exists demand_id uuid references public.demands(id) on delete set null;
alter table public.tasks
  add column if not exists demand_id uuid references public.demands(id) on delete set null;
alter table public.activities
  add column if not exists demand_id uuid references public.demands(id) on delete set null;

update public.demands demand
set last_relevant_activity_at = coalesce(
      demand.last_relevant_activity_at,
      demand.updated_at,
      demand.created_at,
      now()
    ),
    review_due_at = coalesce(
      demand.review_due_at,
      coalesce(demand.updated_at, demand.created_at, now()) + interval '20 days'
    )
where demand.deleted_at is null;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'demands_review_count_check'
      and conrelid = 'public.demands'::regclass
  ) then
    alter table public.demands
      add constraint demands_review_count_check
      check (review_count >= 0)
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'demands_close_reason_code_check'
      and conrelid = 'public.demands'::regclass
  ) then
    alter table public.demands
      add constraint demands_close_reason_code_check
      check (
        close_reason_code is null
        or close_reason_code in (
          'nu_mai_este_interesat',
          'cumparat_prin_alta_parte',
          'buget_insuficient',
          'nu_mai_raspunde',
          'cerere_duplicata',
          'criterii_imposibile',
          'amanare',
          'alt_motiv'
        )
      )
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'demands_closed_evidence_check'
      and conrelid = 'public.demands'::regclass
  ) then
    alter table public.demands
      add constraint demands_closed_evidence_check
      check (
        status not in ('inchisa', 'closed')
        or (
          closed_at is not null
          and close_reason_code is not null
        )
      )
      not valid;
  end if;
end
$constraints$;

alter table public.demands validate constraint demands_review_count_check;
alter table public.demands validate constraint demands_close_reason_code_check;
alter table public.demands validate constraint demands_closed_evidence_check;

create table if not exists public.demand_review_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  demand_id uuid not null references public.demands(id) on delete restrict,
  contact_id uuid references public.contacts(id) on delete set null,
  agent_id uuid references auth.users(id),
  event_type text not null,
  from_status text,
  to_status text not null,
  reason_code text,
  note text,
  next_action_type text,
  next_action_at timestamptz,
  blockers jsonb not null default '[]'::jsonb,
  actor_id uuid references auth.users(id),
  source text not null,
  dedup_key text not null,
  created_at timestamptz not null default now(),
  unique(agency_id, dedup_key)
);

create index if not exists demands_review_due_idx
  on public.demands(agency_id, review_due_at, status)
  where deleted_at is null
    and status in ('activa', 'inactiva', 'de_verificat_inchidere');
create index if not exists demand_review_events_demand_idx
  on public.demand_review_events(agency_id, demand_id, created_at desc);
create index if not exists calendar_events_demand_idx
  on public.calendar_events(agency_id, demand_id, start_at desc)
  where demand_id is not null;
create index if not exists tasks_demand_idx
  on public.tasks(agency_id, demand_id, due_at desc)
  where demand_id is not null;
create index if not exists activities_demand_idx
  on public.activities(agency_id, demand_id, created_at desc)
  where demand_id is not null;

create or replace function public.crm_demand_last_relevant_activity(
  p_agency_id uuid,
  p_demand_id uuid,
  p_now timestamptz default now()
)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select greatest(
    coalesce(demand.created_at, '-infinity'::timestamptz),
    coalesce(demand.updated_at, '-infinity'::timestamptz),
    coalesce(demand.last_relevant_activity_at, '-infinity'::timestamptz),
    coalesce((
      select max(activity.created_at)
      from public.activities activity
      where activity.agency_id = p_agency_id
        and activity.demand_id = p_demand_id
    ), '-infinity'::timestamptz),
    coalesce((
      select max(event.start_at)
      from public.calendar_events event
      where event.agency_id = p_agency_id
        and event.demand_id = p_demand_id
        and (to_jsonb(event)->>'deleted_at') is null
        and event.start_at <= p_now
    ), '-infinity'::timestamptz),
    coalesce((
      select max(coalesce(
        nullif(to_jsonb(match_row)->>'evaluated_at', '')::timestamptz,
        match_row.created_at
      ))
      from public.matches match_row
      where match_row.agency_id = p_agency_id
        and match_row.demand_id = p_demand_id
    ), '-infinity'::timestamptz)
  )
  from public.demands demand
  where demand.id = p_demand_id
    and demand.agency_id = p_agency_id
    and demand.deleted_at is null
$function$;

create or replace function public.crm_demand_review_blockers(
  p_agency_id uuid,
  p_demand_id uuid,
  p_now timestamptz default now(),
  p_min_inactive_days integer default 20,
  p_check_age boolean default true
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  demand_row public.demands%rowtype;
  blockers jsonb := '[]'::jsonb;
  last_activity timestamptz;
begin
  select * into demand_row
  from public.demands demand
  where demand.id = p_demand_id
    and demand.agency_id = p_agency_id
    and demand.deleted_at is null;
  if not found then return jsonb_build_array('Cererea nu există în această agenție.'); end if;

  last_activity := public.crm_demand_last_relevant_activity(
    p_agency_id, p_demand_id, p_now
  );
  if p_check_age and (
    last_activity is null
    or last_activity > p_now - make_interval(
      days => greatest(1, least(p_min_inactive_days, 365))
    )
  ) then
    blockers := blockers || jsonb_build_array(
      format(
        'Ultima activitate relevantă nu are încă %s zile.',
        greatest(1, least(p_min_inactive_days, 365))
      )
    );
  end if;

  if exists (
    select 1
    from public.matches match_row
    join public.properties property
      on property.id = match_row.property_id
     and property.agency_id = match_row.agency_id
    where match_row.agency_id = p_agency_id
      and match_row.demand_id = p_demand_id
      and property.deleted_at is null
      and property.status in ('activa', 'rezervata')
      and coalesce(match_row.status, 'noua') in (
        'noua', 'revizuita', 'aprobata', 'trimisa', 'sent', 'accepted'
      )
  ) then
    blockers := blockers || jsonb_build_array(
      'Cererea are cel puțin o proprietate activă asociată.'
    );
  end if;

  if exists (
    select 1
    from public.calendar_events event
    where event.agency_id = p_agency_id
      and (to_jsonb(event)->>'deleted_at') is null
      and event.type = 'vizionare'
      and event.status in ('programata', 'confirmata', 'amanata')
      and event.start_at > p_now
      and (
        event.demand_id = p_demand_id
        or (
          event.demand_id is null
          and event.contact_id = demand_row.contact_id
        )
      )
  ) then
    blockers := blockers || jsonb_build_array('Cererea are o vizionare viitoare.');
  end if;

  if exists (
    select 1
    from public.transactions transaction_row
    where transaction_row.agency_id = p_agency_id
      and transaction_row.contact_id = demand_row.contact_id
      and (to_jsonb(transaction_row)->>'deleted_at') is null
      and coalesce(transaction_row.status, 'draft') not in ('finalizata', 'anulata')
  ) then
    blockers := blockers || jsonb_build_array(
      'Clientul are o ofertă, negociere sau tranzacție activă.'
    );
  end if;

  if exists (
    select 1
    from public.tasks task
    left join public.leads lead
      on lead.id = task.lead_id
     and lead.agency_id = task.agency_id
    where task.agency_id = p_agency_id
      and (to_jsonb(task)->>'deleted_at') is null
      and coalesce(task.status, 'open') not in (
        'done', 'completed', 'closed', 'cancelled', 'anulat', 'finalizat'
      )
      and task.due_at is not null
      and task.due_at > p_now
      and (
        task.demand_id = p_demand_id
        or (
          task.demand_id is null
          and lead.contact_id = demand_row.contact_id
        )
      )
  ) then
    blockers := blockers || jsonb_build_array('Cererea are un task viitor.');
  end if;

  if demand_row.contact_after_at is not null
     and demand_row.contact_after_at > p_now then
    blockers := blockers || jsonb_build_array(
      'Clientul a cerut să fie contactat la o dată ulterioară.'
    );
  end if;

  if demand_row.next_action_at is not null
     and demand_row.next_action_at > p_now then
    blockers := blockers || jsonb_build_array(
      'Cererea are deja o acțiune viitoare planificată.'
    );
  end if;

  return blockers;
end
$function$;

create or replace function public.crm_guard_demand_review_status()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if old.status is distinct from new.status
     and (
       old.status in ('de_verificat_inchidere', 'inchisa', 'closed')
       or new.status in ('de_verificat_inchidere', 'inchisa', 'closed')
       or new.status in ('indeplinita', 'anulata')
     )
     and coalesce(current_setting('crm.demand_review_transition', true), '') <> 'allowed' then
    raise exception 'demand_review_rpc_required';
  end if;
  return new;
end
$function$;

drop trigger if exists crm_guard_demand_review_status_trigger on public.demands;
create trigger crm_guard_demand_review_status_trigger
before update of status on public.demands
for each row execute function public.crm_guard_demand_review_status();

create or replace function public.crm_prepare_demand_review_dates()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if tg_op = 'INSERT' then
    new.last_relevant_activity_at := coalesce(
      new.last_relevant_activity_at,
      new.updated_at,
      new.created_at,
      now()
    );
    new.review_due_at := coalesce(
      new.review_due_at,
      new.last_relevant_activity_at + interval '20 days'
    );
  else
    new.last_relevant_activity_at := now();
    new.review_due_at := now() + interval '20 days';
    new.review_marked_at := null;
    new.review_notified_at := null;
    new.review_blockers_snapshot := '[]'::jsonb;
  end if;
  return new;
end
$function$;

drop trigger if exists crm_prepare_demand_review_dates_trigger on public.demands;
create trigger crm_prepare_demand_review_dates_trigger
before insert or update of
  criteria, category, transaction, budget_min, budget_max, currency,
  counties, cities, zones, notes, intent, budget_unknown, property_types,
  radius_km, rooms_min, rooms_max, usable_area_min, usable_area_max,
  land_area_min, land_area_max, floor_preferences, furnished_preference,
  parking_required, financing, deadline_date, special_requirements,
  next_action_type, next_action_at, contact_after_at
on public.demands
for each row execute function public.crm_prepare_demand_review_dates();

create or replace function public.crm_mark_demands_for_review(
  p_now timestamptz default now(),
  p_agency_id uuid default null,
  p_min_inactive_days integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  demand_row record;
  blockers jsonb;
  last_activity timestamptz;
  previous_guard text;
  updated_count integer := 0;
  reviewed_count integer := 0;
  blocked_count integer := 0;
begin
  for demand_row in
    select demand.*
    from public.demands demand
    where demand.deleted_at is null
      and demand.status in ('activa', 'inactiva')
      and (p_agency_id is null or demand.agency_id = p_agency_id)
      and coalesce(
        demand.review_due_at,
        demand.updated_at + make_interval(
          days => greatest(1, least(p_min_inactive_days, 365))
        )
      ) <= p_now
  loop
    last_activity := public.crm_demand_last_relevant_activity(
      demand_row.agency_id, demand_row.id, p_now
    );
    blockers := public.crm_demand_review_blockers(
      demand_row.agency_id,
      demand_row.id,
      p_now,
      p_min_inactive_days,
      true
    );

    update public.demands
    set last_relevant_activity_at = last_activity,
        review_due_at = last_activity + make_interval(
          days => greatest(1, least(p_min_inactive_days, 365))
        ),
        review_blockers_snapshot = blockers
    where id = demand_row.id and agency_id = demand_row.agency_id;

    if jsonb_array_length(blockers) > 0 then
      blocked_count := blocked_count + 1;
      continue;
    end if;

    previous_guard := coalesce(
      current_setting('crm.demand_review_transition', true), ''
    );
    perform set_config('crm.demand_review_transition', 'allowed', true);
    update public.demands
    set status = 'de_verificat_inchidere',
        review_marked_at = p_now,
        review_notified_at = p_now,
        review_count = coalesce(review_count, 0) + 1,
        review_blockers_snapshot = '[]'::jsonb
    where id = demand_row.id
      and agency_id = demand_row.agency_id
      and status in ('activa', 'inactiva');
    get diagnostics updated_count = row_count;
    perform set_config('crm.demand_review_transition', previous_guard, true);

    if updated_count > 0 then
      insert into public.demand_review_events(
        agency_id, demand_id, contact_id, agent_id, event_type,
        from_status, to_status, blockers, actor_id, source, dedup_key, created_at
      ) values (
        demand_row.agency_id,
        demand_row.id,
        demand_row.contact_id,
        demand_row.agent_id,
        'marked_for_review',
        demand_row.status,
        'de_verificat_inchidere',
        '[]'::jsonb,
        null,
        'scheduled_review',
        'demand-review:' || demand_row.id::text || ':' ||
          coalesce(demand_row.review_count, 0)::text,
        p_now
      )
      on conflict(agency_id, dedup_key) do nothing;

      perform public.crm_enqueue_notification(
        demand_row.agency_id,
        demand_row.agent_id,
        'demand_closure_review',
        'Cerere de verificat pentru închidere',
        coalesce(demand_row.internal_code, 'Cererea') ||
          ' nu are activitate relevantă de minimum ' ||
          greatest(1, least(p_min_inactive_days, 365))::text || ' zile.',
        'demand',
        demand_row.id::text,
        'high',
        '/matches?demand_id=' || demand_row.id::text,
        'demand-review:' || demand_row.id::text || ':' ||
          coalesce(demand_row.review_count, 0)::text,
        jsonb_build_object(
          'review_marked_at', p_now,
          'last_relevant_activity_at', last_activity
        )
      );
      reviewed_count := reviewed_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'processed_at', p_now,
    'timezone', 'Europe/Bucharest',
    'minimum_inactive_days', greatest(1, least(p_min_inactive_days, 365)),
    'marked_for_review', reviewed_count,
    'blocked_from_review', blocked_count
  );
exception when others then
  if previous_guard is not null then
    perform set_config('crm.demand_review_transition', previous_guard, true);
  end if;
  raise;
end
$function$;

create or replace function public.crm_review_demand(
  p_agency_id uuid,
  p_actor_id uuid,
  p_demand_id uuid,
  p_action text,
  p_reason_code text,
  p_note text,
  p_next_action_type text,
  p_next_action_at timestamptz,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  demand_row public.demands%rowtype;
  actor_role text;
  blockers jsonb := '[]'::jsonb;
  target_status text;
  event_type text;
  clean_note text := nullif(trim(p_note), '');
  previous_guard text := coalesce(
    current_setting('crm.demand_review_transition', true), ''
  );
begin
  if p_action not in ('close', 'extend', 'activity', 'reopen') then
    raise exception 'invalid_demand_review_action';
  end if;
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'demand_review_idempotency_key_required';
  end if;

  select * into demand_row
  from public.demands demand
  where demand.id = p_demand_id
    and demand.agency_id = p_agency_id
    and demand.deleted_at is null
  for update;
  if not found then raise exception 'demand_not_found'; end if;

  select profile.role into actor_role
  from public.profiles profile
  where profile.user_id = p_actor_id
    and profile.agency_id = p_agency_id
    and coalesce(profile.status, 'active') = 'active';
  if actor_role is null then raise exception 'demand_review_actor_not_in_agency'; end if;
  if actor_role not in ('owner', 'admin', 'manager')
     and demand_row.agent_id is distinct from p_actor_id then
    raise exception 'demand_review_actor_not_allowed';
  end if;

  if p_action in ('close', 'extend', 'activity')
     and demand_row.status <> 'de_verificat_inchidere' then
    raise exception 'demand_not_waiting_for_review';
  end if;
  if p_action = 'reopen'
     and demand_row.status not in ('inchisa', 'closed', 'indeplinita', 'anulata') then
    raise exception 'demand_not_closed';
  end if;

  if p_action = 'close' then
    if p_reason_code not in (
      'nu_mai_este_interesat',
      'cumparat_prin_alta_parte',
      'buget_insuficient',
      'nu_mai_raspunde',
      'cerere_duplicata',
      'criterii_imposibile',
      'amanare',
      'alt_motiv'
    ) then
      raise exception 'demand_close_reason_required';
    end if;
    if p_reason_code = 'alt_motiv'
       and coalesce(length(clean_note), 0) < 5 then
      raise exception 'demand_close_note_required';
    end if;
    blockers := public.crm_demand_review_blockers(
      p_agency_id, p_demand_id, now(), 20, false
    );
    if jsonb_array_length(blockers) > 0 then
      raise exception 'demand_review_blocked:%', blockers::text;
    end if;
    target_status := 'inchisa';
    event_type := 'closed';
  elsif p_action in ('extend', 'activity', 'reopen') then
    if p_next_action_at is null or p_next_action_at <= now() then
      raise exception 'demand_future_next_action_required';
    end if;
    if nullif(trim(p_next_action_type), '') is null then
      raise exception 'demand_next_action_type_required';
    end if;
    if p_action = 'activity' and coalesce(length(clean_note), 0) < 5 then
      raise exception 'demand_activity_note_required';
    end if;
    if p_action = 'reopen' and coalesce(length(clean_note), 0) < 5 then
      raise exception 'demand_reopen_note_required';
    end if;
    target_status := 'activa';
    event_type := case p_action
      when 'extend' then 'extended'
      when 'activity' then 'activity_added'
      else 'reopened'
    end;
  end if;

  if exists (
    select 1 from public.demand_review_events event
    where event.agency_id = p_agency_id
      and event.dedup_key = 'demand-action:' || trim(p_idempotency_key)
  ) then
    return jsonb_build_object(
      'success', true,
      'duplicate', true,
      'demand_id', p_demand_id,
      'status', demand_row.status
    );
  end if;

  perform set_config('crm.demand_review_transition', 'allowed', true);
  update public.demands
  set status = target_status,
      last_relevant_activity_at = case
        when p_action = 'close' then last_relevant_activity_at
        else now()
      end,
      review_due_at = case
        when p_action = 'close' then null
        else greatest(now(), p_next_action_at) + interval '20 days'
      end,
      review_marked_at = null,
      review_notified_at = null,
      review_blockers_snapshot = '[]'::jsonb,
      next_action_type = case
        when p_action = 'close' then null
        else trim(p_next_action_type)
      end,
      next_action_at = case when p_action = 'close' then null else p_next_action_at end,
      contact_after_at = case
        when p_action = 'extend' then p_next_action_at
        when p_action in ('activity', 'reopen') then null
        else contact_after_at
      end,
      close_reason_code = case
        when p_action = 'close' then p_reason_code
        else null
      end,
      close_reason_note = case
        when p_action = 'close' then clean_note
        else null
      end,
      closed_at = case when p_action = 'close' then now() else null end,
      closed_by = case when p_action = 'close' then p_actor_id else null end,
      reopened_at = case when p_action = 'reopen' then now() else reopened_at end,
      reopened_by = case when p_action = 'reopen' then p_actor_id else reopened_by end
  where id = p_demand_id and agency_id = p_agency_id;
  perform set_config('crm.demand_review_transition', previous_guard, true);

  if p_action = 'activity' then
    insert into public.activities(
      agency_id, user_id, agent_id, contact_id, demand_id,
      type, title, description, scheduled_at, created_at
    ) values (
      p_agency_id,
      p_actor_id,
      demand_row.agent_id,
      demand_row.contact_id,
      p_demand_id,
      'note',
      'Activitate cerere',
      clean_note,
      p_next_action_at,
      now()
    );
  end if;

  insert into public.demand_review_events(
    agency_id, demand_id, contact_id, agent_id, event_type,
    from_status, to_status, reason_code, note,
    next_action_type, next_action_at, blockers,
    actor_id, source, dedup_key, created_at
  ) values (
    p_agency_id,
    p_demand_id,
    demand_row.contact_id,
    demand_row.agent_id,
    event_type,
    demand_row.status,
    target_status,
    p_reason_code,
    clean_note,
    nullif(trim(p_next_action_type), ''),
    p_next_action_at,
    blockers,
    p_actor_id,
    'manual_review',
    'demand-action:' || trim(p_idempotency_key),
    now()
  );

  return jsonb_build_object(
    'success', true,
    'duplicate', false,
    'demand_id', p_demand_id,
    'action', p_action,
    'from_status', demand_row.status,
    'status', target_status
  );
exception when others then
  perform set_config('crm.demand_review_transition', previous_guard, true);
  raise;
end
$function$;

create or replace function public.crm_notify_closed_demands_on_new_lead()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  demand_row record;
begin
  if new.contact_id is null then return new; end if;
  for demand_row in
    select demand.id, demand.agent_id, demand.internal_code
    from public.demands demand
    where demand.agency_id = new.agency_id
      and demand.contact_id = new.contact_id
      and demand.deleted_at is null
      and demand.status in ('inchisa', 'closed', 'indeplinita', 'anulata')
    order by demand.closed_at desc nulls last, demand.updated_at desc
    limit 5
  loop
    perform public.crm_enqueue_notification(
      new.agency_id,
      coalesce(new.responsible_agent_id, new.agent_id, demand_row.agent_id),
      'closed_demand_client_returned',
      'Client revenit cu mesaj nou',
      coalesce(demand_row.internal_code, 'O cerere închisă') ||
        ' poate fi reactivată sau înlocuită cu o cerere nouă.',
      'demand',
      demand_row.id::text,
      'high',
      '/matches?demand_id=' || demand_row.id::text,
      'closed-demand-returned:' || demand_row.id::text || ':' || new.id::text,
      jsonb_build_object('lead_id', new.id, 'contact_id', new.contact_id)
    );
  end loop;
  return new;
end
$function$;

drop trigger if exists crm_notify_closed_demands_on_new_lead_trigger on public.leads;
create trigger crm_notify_closed_demands_on_new_lead_trigger
after insert on public.leads
for each row execute function public.crm_notify_closed_demands_on_new_lead();

alter table public.demand_review_events enable row level security;
revoke all on table public.demand_review_events from public, anon, authenticated;
grant select on table public.demand_review_events to authenticated;
grant select, insert, update, delete on table public.demand_review_events to service_role;

drop policy if exists crm_demand_review_events_select on public.demand_review_events;
create policy crm_demand_review_events_select
on public.demand_review_events
for select to authenticated
using (
  agency_id = public.current_crm_agency_id()
  and exists (
    select 1
    from public.demands demand
    where demand.id = demand_review_events.demand_id
      and demand.agency_id = demand_review_events.agency_id
      and public.crm_can_access_row(
        'demands',
        array[demand.agent_id]::uuid[]
      )
  )
);

revoke all on function public.crm_demand_last_relevant_activity(uuid, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function public.crm_demand_review_blockers(
  uuid, uuid, timestamptz, integer, boolean
) from public, anon, authenticated;
revoke all on function public.crm_guard_demand_review_status()
  from public, anon, authenticated;
revoke all on function public.crm_prepare_demand_review_dates()
  from public, anon, authenticated;
revoke all on function public.crm_mark_demands_for_review(timestamptz, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.crm_review_demand(
  uuid, uuid, uuid, text, text, text, text, timestamptz, text
) from public, anon, authenticated;
revoke all on function public.crm_notify_closed_demands_on_new_lead()
  from public, anon, authenticated;

grant execute on function public.crm_demand_last_relevant_activity(uuid, uuid, timestamptz)
  to service_role;
grant execute on function public.crm_demand_review_blockers(
  uuid, uuid, timestamptz, integer, boolean
) to service_role;
grant execute on function public.crm_guard_demand_review_status()
  to service_role;
grant execute on function public.crm_prepare_demand_review_dates()
  to service_role;
grant execute on function public.crm_mark_demands_for_review(timestamptz, uuid, integer)
  to service_role;
grant execute on function public.crm_review_demand(
  uuid, uuid, uuid, text, text, text, text, timestamptz, text
) to service_role;
grant execute on function public.crm_notify_closed_demands_on_new_lead()
  to service_role;

commit;
