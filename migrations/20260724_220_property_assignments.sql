-- Operational extension 1: canonical property responsibility and reversible assignment history.
-- Additive and idempotent. Apply after 20260723_210_system_observability.sql.

begin;

alter table public.properties
  add column if not exists responsible_agent_id uuid references auth.users(id);
alter table public.properties
  add column if not exists assigned_by_user_id uuid references auth.users(id);
alter table public.properties
  add column if not exists assigned_at timestamptz;
alter table public.properties
  add column if not exists assignment_reason text;
alter table public.properties
  add column if not exists assignment_updated_at timestamptz;
alter table public.properties
  add column if not exists assignment_status text;

update public.properties
set responsible_agent_id = agent_id,
    assigned_at = coalesce(assigned_at, updated_at, now()),
    assignment_updated_at = coalesce(assignment_updated_at, updated_at, now()),
    assignment_status = case
      when agent_id is not null then 'assigned'
      else 'unassigned_exception'
    end,
    assignment_reason = case
      when agent_id is null then coalesce(nullif(assignment_reason, ''), 'legacy_unassigned')
      else assignment_reason
    end
where responsible_agent_id is null
   or assignment_status is null
   or assigned_at is null
   or assignment_updated_at is null;

do $constraints$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'properties_assignment_status_check'
      and conrelid = 'public.properties'::regclass
  ) then
    alter table public.properties add constraint properties_assignment_status_check
      check (assignment_status in ('assigned', 'unassigned_exception', 'inactive'))
      not valid;
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'properties_active_assignment_check'
      and conrelid = 'public.properties'::regclass
  ) then
    alter table public.properties add constraint properties_active_assignment_check
      check (
        status <> 'activa'
        or responsible_agent_id is not null
        or (
          assignment_status = 'unassigned_exception'
          and nullif(trim(assignment_reason), '') is not null
        )
      ) not valid;
  end if;
end
$constraints$;

alter table public.properties validate constraint properties_assignment_status_check;
alter table public.properties validate constraint properties_active_assignment_check;

create index if not exists properties_responsible_agent_idx
  on public.properties(agency_id, responsible_agent_id, status)
  where deleted_at is null;
create index if not exists properties_unassigned_active_idx
  on public.properties(agency_id, assignment_updated_at desc)
  where deleted_at is null
    and status = 'activa'
    and responsible_agent_id is null;

create table if not exists public.property_assignment_history (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  previous_agent_id uuid references auth.users(id),
  responsible_agent_id uuid references auth.users(id),
  assigned_by_user_id uuid references auth.users(id),
  reason text,
  assignment_status text not null,
  cascade_options jsonb not null default '{}'::jsonb,
  changed_at timestamptz not null default now()
);

create index if not exists property_assignment_history_property_idx
  on public.property_assignment_history(agency_id, property_id, changed_at desc);
create index if not exists property_assignment_history_agent_idx
  on public.property_assignment_history(agency_id, responsible_agent_id, changed_at desc);

insert into public.property_assignment_history(
  agency_id, property_id, previous_agent_id, responsible_agent_id,
  assigned_by_user_id, reason, assignment_status, cascade_options, changed_at
)
select
  p.agency_id, p.id, null, p.responsible_agent_id, p.assigned_by_user_id,
  coalesce(p.assignment_reason, 'migration_backfill'), p.assignment_status,
  jsonb_build_object('origin', 'migration_backfill'),
  coalesce(p.assignment_updated_at, now())
from public.properties p
where not exists (
  select 1 from public.property_assignment_history h
  where h.property_id = p.id
);

create or replace function public.crm_validate_property_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  assignment_changed boolean;
begin
  if tg_op = 'INSERT' then
    if new.responsible_agent_id is null and new.agent_id is not null then
      new.responsible_agent_id := new.agent_id;
    end if;
    assignment_changed := true;
  else
    if new.agent_id is distinct from old.agent_id
       and new.responsible_agent_id is not distinct from old.responsible_agent_id then
      new.responsible_agent_id := new.agent_id;
    end if;
    assignment_changed :=
      new.responsible_agent_id is distinct from old.responsible_agent_id
      or new.assignment_status is distinct from old.assignment_status;
  end if;

  if new.responsible_agent_id is not null and not exists (
    select 1
    from public.profiles profile
    where profile.user_id = new.responsible_agent_id
      and profile.agency_id = new.agency_id
      and coalesce(profile.status, 'active') = 'active'
  ) then
    raise exception 'responsible_agent_not_active_in_agency';
  end if;

  new.agent_id := new.responsible_agent_id;

  if assignment_changed then
    new.assigned_at := now();
    new.assignment_updated_at := now();
    new.assigned_by_user_id := coalesce(new.assigned_by_user_id, auth.uid());
    new.assignment_status := case
      when new.responsible_agent_id is not null then 'assigned'
      when new.status = 'activa' then 'unassigned_exception'
      else 'inactive'
    end;
  else
    new.assignment_updated_at := coalesce(new.assignment_updated_at, new.assigned_at, now());
  end if;

  if new.status = 'activa'
     and new.responsible_agent_id is null
     and (
       new.assignment_status <> 'unassigned_exception'
       or nullif(trim(new.assignment_reason), '') is null
     ) then
    raise exception 'active_property_requires_agent_or_documented_exception';
  end if;

  return new;
end
$function$;

create or replace function public.crm_record_property_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  options jsonb := '{}'::jsonb;
begin
  if tg_op = 'UPDATE'
     and new.responsible_agent_id is not distinct from old.responsible_agent_id
     and new.assignment_status is not distinct from old.assignment_status then
    return new;
  end if;

  begin
    options := coalesce(
      nullif(current_setting('crm.assignment_options', true), '')::jsonb,
      '{}'::jsonb
    );
  exception when others then
    options := '{}'::jsonb;
  end;

  insert into public.property_assignment_history(
    agency_id, property_id, previous_agent_id, responsible_agent_id,
    assigned_by_user_id, reason, assignment_status, cascade_options, changed_at
  ) values (
    new.agency_id, new.id,
    case when tg_op = 'UPDATE' then old.responsible_agent_id else null end,
    new.responsible_agent_id, new.assigned_by_user_id,
    new.assignment_reason, new.assignment_status, options,
    coalesce(new.assignment_updated_at, now())
  );
  return new;
end
$function$;

drop trigger if exists crm_validate_property_assignment_trigger on public.properties;
create trigger crm_validate_property_assignment_trigger
before insert or update of agent_id, responsible_agent_id, assignment_status,
  assignment_reason, status
on public.properties
for each row execute function public.crm_validate_property_assignment();

drop trigger if exists crm_record_property_assignment_trigger on public.properties;
create trigger crm_record_property_assignment_trigger
after insert or update of responsible_agent_id, assignment_status
on public.properties
for each row execute function public.crm_record_property_assignment();

create or replace function public.crm_assign_properties(
  p_agency_id uuid,
  p_actor_id uuid,
  p_property_ids uuid[],
  p_responsible_agent_id uuid,
  p_reason text default null,
  p_reassign_active_leads boolean default false,
  p_reassign_open_tasks boolean default false,
  p_reassign_future_viewings boolean default false,
  p_reassign_active_demands boolean default false,
  p_allow_unassigned_exception boolean default false
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  selected_count integer;
  changed_count integer;
  lead_count integer := 0;
  task_count integer := 0;
  viewing_count integer := 0;
  demand_count integer := 0;
  property_row record;
  clean_reason text := nullif(trim(p_reason), '');
  options jsonb;
begin
  if p_agency_id is null or p_actor_id is null or coalesce(cardinality(p_property_ids), 0) = 0 then
    raise exception 'invalid_assignment_request';
  end if;
  if cardinality(p_property_ids) > 100 then
    raise exception 'assignment_batch_too_large';
  end if;
  if p_actor_id <> auth.uid()
     or p_agency_id <> public.current_crm_agency_id()
     or not public.crm_has_permission('properties', 'assign') then
    raise exception 'property_assignment_forbidden';
  end if;
  if p_responsible_agent_id is null and not p_allow_unassigned_exception then
    raise exception 'unassigned_property_requires_explicit_exception';
  end if;
  if p_responsible_agent_id is null and clean_reason is null then
    raise exception 'unassigned_property_requires_reason';
  end if;
  if p_responsible_agent_id is not null and not exists (
    select 1 from public.profiles profile
    where profile.user_id = p_responsible_agent_id
      and profile.agency_id = p_agency_id
      and coalesce(profile.status, 'active') = 'active'
  ) then
    raise exception 'responsible_agent_not_active_in_agency';
  end if;

  select count(*) into selected_count
  from public.properties property
  where property.id = any(p_property_ids)
    and property.agency_id = p_agency_id
    and property.deleted_at is null;
  if selected_count <> cardinality(p_property_ids) then
    raise exception 'property_selection_outside_agency_or_missing';
  end if;

  if clean_reason is null and exists (
    select 1 from public.properties property
    where property.id = any(p_property_ids)
      and property.agency_id = p_agency_id
      and property.responsible_agent_id is distinct from p_responsible_agent_id
      and property.responsible_agent_id is not null
  ) then
    raise exception 'reassignment_reason_required';
  end if;

  options := jsonb_build_object(
    'reassign_active_leads', p_reassign_active_leads,
    'reassign_open_tasks', p_reassign_open_tasks,
    'reassign_future_viewings', p_reassign_future_viewings,
    'reassign_active_demands', p_reassign_active_demands,
    'allow_unassigned_exception', p_allow_unassigned_exception
  );
  perform set_config('crm.assignment_options', options::text, true);

  update public.properties property
  set responsible_agent_id = p_responsible_agent_id,
      assigned_by_user_id = p_actor_id,
      assignment_reason = clean_reason,
      assignment_status = case
        when p_responsible_agent_id is not null then 'assigned'
        when property.status = 'activa' then 'unassigned_exception'
        else 'inactive'
      end
  where property.id = any(p_property_ids)
    and property.agency_id = p_agency_id
    and property.deleted_at is null
    and (
      property.responsible_agent_id is distinct from p_responsible_agent_id
      or property.assignment_reason is distinct from clean_reason
    );
  get diagnostics changed_count = row_count;

  if p_reassign_active_leads then
    update public.leads lead
    set agent_id = p_responsible_agent_id
    where lead.agency_id = p_agency_id
      and lead.property_id = any(p_property_ids)
      and lead.deleted_at is null
      and coalesce(lead.status, 'new') not in ('won', 'lost', 'withdrawn', 'finalizat', 'pierdut');
    get diagnostics lead_count = row_count;
  end if;

  if p_reassign_open_tasks then
    update public.tasks task
    set assigned_to = p_responsible_agent_id
    where task.agency_id = p_agency_id
      and task.property_id = any(p_property_ids)
      and coalesce(task.status, 'pending') not in ('completed', 'done', 'cancelled', 'anulat');
    get diagnostics task_count = row_count;
  end if;

  if p_reassign_future_viewings then
    update public.calendar_events viewing
    set agent_id = p_responsible_agent_id,
        updated_at = now()
    where viewing.agency_id = p_agency_id
      and viewing.property_id = any(p_property_ids)
      and viewing.type = 'viewing'
      and viewing.start_at >= now()
      and viewing.deleted_at is null
      and coalesce(viewing.status, 'programata') not in ('anulata', 'finalizata');
    get diagnostics viewing_count = row_count;
  end if;

  if p_reassign_active_demands then
    update public.demands demand
    set agent_id = p_responsible_agent_id,
        updated_at = now()
    where demand.agency_id = p_agency_id
      and demand.deleted_at is null
      and demand.status = 'activa'
      and exists (
        select 1 from public.matches match
        where match.agency_id = p_agency_id
          and match.demand_id = demand.id
          and match.property_id = any(p_property_ids)
      );
    get diagnostics demand_count = row_count;
  end if;

  if p_responsible_agent_id is not null then
    for property_row in
      select property.id, property.title
      from public.properties property
      where property.id = any(p_property_ids)
        and property.agency_id = p_agency_id
        and property.deleted_at is null
    loop
      perform public.crm_enqueue_notification(
        p_agency_id,
        p_responsible_agent_id,
        'property_assigned',
        'Proprietate alocată',
        coalesce(property_row.title, 'O proprietate') || ' ți-a fost alocată.',
        'property',
        property_row.id::text,
        'high',
        '/properties/' || property_row.id::text,
        'property-assignment:' || property_row.id::text || ':' ||
          p_responsible_agent_id::text || ':' || extract(epoch from now())::bigint::text,
        options
      );
    end loop;
  end if;

  return jsonb_build_object(
    'selected', selected_count,
    'changed', changed_count,
    'active_leads_reassigned', lead_count,
    'open_tasks_reassigned', task_count,
    'future_viewings_reassigned', viewing_count,
    'active_demands_reassigned', demand_count
  );
end
$function$;

create or replace function public.crm_can_access_property(p_property_id uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.properties property
    where property.id = p_property_id
      and property.agency_id = public.current_crm_agency_id()
      and public.crm_has_permission('properties', p_action)
      and public.crm_can_access_row(
        'properties',
        array[coalesce(property.responsible_agent_id, property.agent_id)]::uuid[]
      )
  )
$$;

alter table public.property_assignment_history enable row level security;
revoke all on table public.property_assignment_history from public, anon, authenticated;
grant select on table public.property_assignment_history to authenticated;
grant select, insert, update, delete on table public.property_assignment_history to service_role;

drop policy if exists crm_property_assignment_history_select on public.property_assignment_history;
create policy crm_property_assignment_history_select
on public.property_assignment_history
for select to authenticated
using (
  agency_id = public.current_crm_agency_id()
  and public.crm_can_access_property(property_id, 'view')
);

revoke all on function public.crm_assign_properties(
  uuid, uuid, uuid[], uuid, text, boolean, boolean, boolean, boolean, boolean
) from public, anon;
grant execute on function public.crm_assign_properties(
  uuid, uuid, uuid[], uuid, text, boolean, boolean, boolean, boolean, boolean
) to authenticated, service_role;

revoke all on function public.crm_validate_property_assignment() from public, anon, authenticated;
revoke all on function public.crm_record_property_assignment() from public, anon, authenticated;
grant execute on function public.crm_validate_property_assignment() to service_role;
grant execute on function public.crm_record_property_assignment() to service_role;

commit;
