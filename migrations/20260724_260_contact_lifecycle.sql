-- Operational extension 5: one durable lifecycle for the canonical contact.
-- Archive is a reversible business state, never a delete operation.

begin;

alter table public.contacts
  add column if not exists agent_id uuid references auth.users(id);
alter table public.contacts
  add column if not exists created_at timestamptz not null default now();
alter table public.contacts
  add column if not exists lifecycle_status text not null default 'client_nou';
alter table public.contacts
  add column if not exists lifecycle_changed_at timestamptz not null default now();
alter table public.contacts
  add column if not exists lifecycle_reason text;
alter table public.contacts
  add column if not exists last_relevant_activity_at timestamptz;
alter table public.contacts
  add column if not exists old_since_at timestamptz;
alter table public.contacts
  add column if not exists archived_at timestamptz;
alter table public.contacts
  add column if not exists archived_by uuid references auth.users(id);
alter table public.contacts
  add column if not exists archive_reason text;
alter table public.contacts
  add column if not exists reactivated_at timestamptz;

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contacts_lifecycle_status_check'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts
      add constraint contacts_lifecycle_status_check
      check (lifecycle_status in (
        'client_nou',
        'de_contactat',
        'contactat',
        'client_activ',
        'in_asteptare',
        'client_vechi',
        'arhivat'
      ))
      not valid;
  end if;
  if not exists (
    select 1
    from pg_constraint
    where conname = 'contacts_archive_reason_check'
      and conrelid = 'public.contacts'::regclass
  ) then
    alter table public.contacts
      add constraint contacts_archive_reason_check
      check (
        lifecycle_status <> 'arhivat'
        or (
          archived_at is not null
          and length(trim(coalesce(archive_reason, ''))) >= 5
        )
      )
      not valid;
  end if;
end
$constraints$;

-- Existing profiles are never auto-archived during migration.
update public.contacts contact
set lifecycle_status = case
      when exists (
        select 1
        from public.demands demand
        where demand.agency_id = contact.agency_id
          and demand.contact_id = contact.id
          and (to_jsonb(demand)->>'deleted_at') is null
          and coalesce(demand.status, 'activa') not in (
            'inchisa', 'closed', 'finalizata', 'anulata', 'retrasa', 'respinsa'
          )
      ) or exists (
        select 1
        from public.transactions transaction_row
        where transaction_row.agency_id = contact.agency_id
          and transaction_row.contact_id = contact.id
          and (to_jsonb(transaction_row)->>'deleted_at') is null
          and coalesce(transaction_row.status, 'draft') not in ('finalizata', 'anulata')
      ) then 'client_activ'
      when exists (
        select 1
        from public.leads lead
        where lead.agency_id = contact.agency_id
          and lead.contact_id = contact.id
          and lead.deleted_at is null
          and lead.first_successful_contact_at is not null
      ) then 'contactat'
      else 'client_nou'
    end,
    lifecycle_changed_at = coalesce(contact.lifecycle_changed_at, now()),
    last_relevant_activity_at = coalesce(contact.last_relevant_activity_at, contact.created_at, now())
where coalesce(contact.merge_status, 'active') = 'active'
  and contact.deleted_at is null
  and contact.lifecycle_status is distinct from case
    when exists (
      select 1 from public.demands demand
      where demand.agency_id = contact.agency_id
        and demand.contact_id = contact.id
        and (to_jsonb(demand)->>'deleted_at') is null
        and coalesce(demand.status, 'activa') not in (
          'inchisa', 'closed', 'finalizata', 'anulata', 'retrasa', 'respinsa'
        )
    ) or exists (
      select 1 from public.transactions transaction_row
      where transaction_row.agency_id = contact.agency_id
        and transaction_row.contact_id = contact.id
        and (to_jsonb(transaction_row)->>'deleted_at') is null
        and coalesce(transaction_row.status, 'draft') not in ('finalizata', 'anulata')
    ) then 'client_activ'
    when exists (
      select 1 from public.leads lead
      where lead.agency_id = contact.agency_id
        and lead.contact_id = contact.id
        and lead.deleted_at is null
        and lead.first_successful_contact_at is not null
    ) then 'contactat'
    else 'client_nou'
  end;

alter table public.contacts validate constraint contacts_lifecycle_status_check;
alter table public.contacts validate constraint contacts_archive_reason_check;

create table if not exists public.contact_lifecycle_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  contact_id uuid not null references public.contacts(id) on delete restrict,
  from_status text,
  to_status text not null,
  reason text,
  source text not null,
  actor_id uuid references auth.users(id),
  metadata jsonb not null default '{}'::jsonb,
  dedup_key text not null,
  created_at timestamptz not null default now(),
  unique(agency_id, dedup_key)
);

create index if not exists contacts_lifecycle_status_idx
  on public.contacts(agency_id, lifecycle_status, lifecycle_changed_at desc)
  where deleted_at is null and merge_status = 'active';
create index if not exists contact_lifecycle_events_contact_idx
  on public.contact_lifecycle_events(agency_id, contact_id, created_at desc);

insert into public.contact_lifecycle_events(
  agency_id, contact_id, from_status, to_status, reason, source,
  actor_id, metadata, dedup_key, created_at
)
select
  contact.agency_id,
  contact.id,
  null,
  contact.lifecycle_status,
  'Stare inițială păstrată la activarea ciclului de viață',
  'migration',
  null,
  '{}'::jsonb,
  'lifecycle-migration:' || contact.id::text,
  coalesce(contact.lifecycle_changed_at, now())
from public.contacts contact
where coalesce(contact.merge_status, 'active') = 'active'
on conflict(agency_id, dedup_key) do nothing;

create or replace function public.crm_record_initial_contact_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  if coalesce(new.merge_status, 'active') = 'active' and new.deleted_at is null then
    insert into public.contact_lifecycle_events(
      agency_id, contact_id, from_status, to_status, reason, source,
      actor_id, metadata, dedup_key, created_at
    ) values (
      new.agency_id,
      new.id,
      null,
      new.lifecycle_status,
      'Profil client creat.',
      'contact_created',
      new.agent_id,
      '{}'::jsonb,
      'contact-created:' || new.id::text,
      coalesce(new.created_at, now())
    )
    on conflict(agency_id, dedup_key) do nothing;
  end if;
  return new;
end
$function$;

drop trigger if exists crm_record_initial_contact_lifecycle_trigger on public.contacts;
create trigger crm_record_initial_contact_lifecycle_trigger
after insert on public.contacts
for each row execute function public.crm_record_initial_contact_lifecycle();

create or replace function public.crm_contact_last_relevant_activity(
  p_agency_id uuid,
  p_contact_id uuid
)
returns timestamptz
language sql
stable
security definer
set search_path = public, pg_temp
as $function$
  select greatest(
    coalesce(contact.created_at, '-infinity'::timestamptz),
    coalesce((
      select max(greatest(
        coalesce(lead.received_at, '-infinity'::timestamptz),
        coalesce(lead.last_contacted_at, '-infinity'::timestamptz),
        coalesce(lead.last_contact_attempt_at, '-infinity'::timestamptz)
      ))
      from public.leads lead
      where lead.agency_id = p_agency_id
        and lead.contact_id = p_contact_id
        and lead.deleted_at is null
    ), '-infinity'::timestamptz),
    coalesce((
      select max(activity.created_at)
      from public.activities activity
      where activity.agency_id = p_agency_id
        and activity.contact_id = p_contact_id
    ), '-infinity'::timestamptz),
    coalesce((
      select max(demand.updated_at)
      from public.demands demand
      where demand.agency_id = p_agency_id
        and demand.contact_id = p_contact_id
        and (to_jsonb(demand)->>'deleted_at') is null
    ), '-infinity'::timestamptz),
    coalesce((
      select max(event.start_at)
      from public.calendar_events event
      where event.agency_id = p_agency_id
        and event.contact_id = p_contact_id
        and (to_jsonb(event)->>'deleted_at') is null
        and event.start_at <= now()
    ), '-infinity'::timestamptz),
    coalesce((
      select max(task.created_at)
      from public.tasks task
      join public.leads lead
        on lead.id = task.lead_id
       and lead.agency_id = task.agency_id
      where task.agency_id = p_agency_id
        and lead.contact_id = p_contact_id
        and (to_jsonb(task)->>'deleted_at') is null
    ), '-infinity'::timestamptz),
    coalesce((
      select max(transaction_row.created_at)
      from public.transactions transaction_row
      where transaction_row.agency_id = p_agency_id
        and transaction_row.contact_id = p_contact_id
        and (to_jsonb(transaction_row)->>'deleted_at') is null
    ), '-infinity'::timestamptz)
  )
  from public.contacts contact
  where contact.id = p_contact_id
    and contact.agency_id = p_agency_id
$function$;

create or replace function public.crm_contact_lifecycle_blockers(
  p_agency_id uuid,
  p_contact_id uuid,
  p_to_status text,
  p_now timestamptz default now(),
  p_old_after_days integer default 60
)
returns jsonb
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $function$
declare
  blockers jsonb := '[]'::jsonb;
  last_activity timestamptz;
begin
  if not exists (
    select 1
    from public.contacts contact
    where contact.id = p_contact_id
      and contact.agency_id = p_agency_id
      and contact.deleted_at is null
      and coalesce(contact.merge_status, 'active') = 'active'
  ) then
    return jsonb_build_array('Clientul nu există în această agenție.');
  end if;

  if p_to_status not in ('client_vechi', 'arhivat') then
    return blockers;
  end if;

  if exists (
    select 1
    from public.demands demand
    where demand.agency_id = p_agency_id
      and demand.contact_id = p_contact_id
      and (to_jsonb(demand)->>'deleted_at') is null
      and coalesce(demand.status, 'activa') not in (
        'inchisa', 'closed', 'finalizata', 'anulata', 'retrasa', 'respinsa'
      )
  ) then
    blockers := blockers || jsonb_build_array('Clientul are cel puțin o cerere activă.');
  end if;

  if exists (
    select 1
    from public.calendar_events event
    where event.agency_id = p_agency_id
      and event.contact_id = p_contact_id
      and (to_jsonb(event)->>'deleted_at') is null
      and event.type = 'vizionare'
      and event.status in ('programata', 'confirmata', 'amanata')
      and event.start_at > p_now
  ) then
    blockers := blockers || jsonb_build_array('Clientul are o vizionare viitoare.');
  end if;

  if exists (
    select 1
    from public.tasks task
    join public.leads lead
      on lead.id = task.lead_id
     and lead.agency_id = task.agency_id
    where task.agency_id = p_agency_id
      and lead.contact_id = p_contact_id
      and (to_jsonb(task)->>'deleted_at') is null
      and coalesce(task.status, 'open') not in (
        'done', 'completed', 'closed', 'cancelled', 'anulat', 'finalizat'
      )
  ) then
    blockers := blockers || jsonb_build_array('Clientul are un task nefinalizat.');
  end if;

  if exists (
    select 1
    from public.transactions transaction_row
    where transaction_row.agency_id = p_agency_id
      and transaction_row.contact_id = p_contact_id
      and (to_jsonb(transaction_row)->>'deleted_at') is null
      and coalesce(transaction_row.status, 'draft') not in ('finalizata', 'anulata')
  ) then
    blockers := blockers || jsonb_build_array('Clientul are o tranzacție activă.');
  end if;

  if p_to_status = 'client_vechi' then
    if not exists (
      select 1
      from public.leads lead
      where lead.agency_id = p_agency_id
        and lead.contact_id = p_contact_id
        and lead.deleted_at is null
        and lead.first_successful_contact_at is not null
    ) then
      blockers := blockers || jsonb_build_array('Clientul nu are un contact reușit documentat.');
    end if;

    if exists (
      select 1
      from public.leads lead
      where lead.agency_id = p_agency_id
        and lead.contact_id = p_contact_id
        and lead.deleted_at is null
        and (
          coalesce(lead.pipeline_stage, 'lead_nou') in ('lead_nou', 'de_contactat')
          or coalesce(lead.status, 'new') = 'new'
        )
    ) then
      blockers := blockers || jsonb_build_array('Clientul are încă un lead nou sau de contactat.');
    end if;

    last_activity := public.crm_contact_last_relevant_activity(p_agency_id, p_contact_id);
    if last_activity is null
       or last_activity > p_now - make_interval(days => greatest(30, least(p_old_after_days, 365))) then
      blockers := blockers || jsonb_build_array(
        format(
          'Ultima activitate trebuie să fie mai veche de %s zile.',
          greatest(30, least(p_old_after_days, 365))
        )
      );
    end if;
  end if;

  return blockers;
end
$function$;

create or replace function public.crm_guard_contact_lifecycle_update()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $function$
begin
  if old.lifecycle_status is distinct from new.lifecycle_status
     and coalesce(current_setting('crm.lifecycle_transition', true), '') <> 'allowed' then
    raise exception 'contact_lifecycle_rpc_required';
  end if;
  return new;
end
$function$;

drop trigger if exists crm_guard_contact_lifecycle_update_trigger on public.contacts;
create trigger crm_guard_contact_lifecycle_update_trigger
before update of lifecycle_status on public.contacts
for each row execute function public.crm_guard_contact_lifecycle_update();

create or replace function public.crm_apply_contact_lifecycle(
  p_agency_id uuid,
  p_contact_id uuid,
  p_to_status text,
  p_actor_id uuid,
  p_reason text,
  p_source text,
  p_dedup_key text,
  p_metadata jsonb default '{}'::jsonb,
  p_occurred_at timestamptz default now()
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  contact_row public.contacts%rowtype;
  previous_guard text := coalesce(current_setting('crm.lifecycle_transition', true), '');
begin
  select * into contact_row
  from public.contacts contact
  where contact.id = p_contact_id
    and contact.agency_id = p_agency_id
    and contact.deleted_at is null
    and coalesce(contact.merge_status, 'active') = 'active'
  for update;
  if not found then raise exception 'contact_not_found'; end if;

  if p_to_status not in (
    'client_nou', 'de_contactat', 'contactat', 'client_activ',
    'in_asteptare', 'client_vechi', 'arhivat'
  ) then
    raise exception 'invalid_contact_lifecycle_status';
  end if;

  if contact_row.lifecycle_status = p_to_status then
    update public.contacts
    set last_relevant_activity_at = greatest(
      coalesce(last_relevant_activity_at, '-infinity'::timestamptz),
      coalesce(p_occurred_at, now())
    )
    where id = p_contact_id and agency_id = p_agency_id;
    return jsonb_build_object(
      'success', true,
      'unchanged', true,
      'contact_id', p_contact_id,
      'status', p_to_status
    );
  end if;

  perform set_config('crm.lifecycle_transition', 'allowed', true);
  update public.contacts
  set lifecycle_status = p_to_status,
      lifecycle_changed_at = coalesce(p_occurred_at, now()),
      lifecycle_reason = nullif(trim(p_reason), ''),
      last_relevant_activity_at = case
        when p_to_status = 'client_vechi'
          then coalesce(last_relevant_activity_at, public.crm_contact_last_relevant_activity(
            p_agency_id, p_contact_id
          ))
        else greatest(
          coalesce(last_relevant_activity_at, '-infinity'::timestamptz),
          coalesce(p_occurred_at, now())
        )
      end,
      old_since_at = case
        when p_to_status = 'client_vechi' then coalesce(p_occurred_at, now())
        else null
      end,
      archived_at = case
        when p_to_status = 'arhivat' then coalesce(p_occurred_at, now())
        else null
      end,
      archived_by = case when p_to_status = 'arhivat' then p_actor_id else null end,
      archive_reason = case
        when p_to_status = 'arhivat' then nullif(trim(p_reason), '')
        else null
      end,
      reactivated_at = case
        when contact_row.lifecycle_status in ('client_vechi', 'arhivat')
          and p_to_status not in ('client_vechi', 'arhivat')
          then coalesce(p_occurred_at, now())
        else reactivated_at
      end
  where id = p_contact_id and agency_id = p_agency_id;
  perform set_config('crm.lifecycle_transition', previous_guard, true);

  insert into public.contact_lifecycle_events(
    agency_id, contact_id, from_status, to_status, reason, source,
    actor_id, metadata, dedup_key, created_at
  ) values (
    p_agency_id,
    p_contact_id,
    contact_row.lifecycle_status,
    p_to_status,
    nullif(trim(p_reason), ''),
    coalesce(nullif(trim(p_source), ''), 'system'),
    p_actor_id,
    coalesce(p_metadata, '{}'::jsonb),
    p_dedup_key,
    coalesce(p_occurred_at, now())
  )
  on conflict(agency_id, dedup_key) do nothing;

  return jsonb_build_object(
    'success', true,
    'unchanged', false,
    'contact_id', p_contact_id,
    'from_status', contact_row.lifecycle_status,
    'status', p_to_status
  );
exception when others then
  perform set_config('crm.lifecycle_transition', previous_guard, true);
  raise;
end
$function$;

create or replace function public.crm_transition_contact_lifecycle(
  p_agency_id uuid,
  p_actor_id uuid,
  p_contact_id uuid,
  p_to_status text,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  contact_row public.contacts%rowtype;
  actor_role text;
  blockers jsonb;
begin
  select * into contact_row
  from public.contacts contact
  where contact.id = p_contact_id
    and contact.agency_id = p_agency_id
    and contact.deleted_at is null
    and coalesce(contact.merge_status, 'active') = 'active'
  for update;
  if not found then raise exception 'contact_not_found'; end if;

  select profile.role into actor_role
  from public.profiles profile
  where profile.user_id = p_actor_id
    and profile.agency_id = p_agency_id
    and coalesce(profile.status, 'active') = 'active';
  if actor_role is null then raise exception 'contact_lifecycle_actor_not_in_agency'; end if;

  if actor_role not in ('owner', 'admin', 'manager')
     and contact_row.agent_id is distinct from p_actor_id then
    raise exception 'contact_lifecycle_actor_not_allowed';
  end if;
  if p_to_status = 'arhivat'
     and actor_role not in ('owner', 'admin', 'manager') then
    raise exception 'contact_archive_manager_required';
  end if;
  if p_to_status = 'arhivat'
     and length(trim(coalesce(p_reason, ''))) < 5 then
    raise exception 'contact_archive_reason_required';
  end if;
  if nullif(trim(p_idempotency_key), '') is null then
    raise exception 'contact_lifecycle_idempotency_key_required';
  end if;

  if not (
    contact_row.lifecycle_status = p_to_status
    or (contact_row.lifecycle_status = 'client_nou'
      and p_to_status in ('de_contactat', 'contactat', 'client_activ', 'in_asteptare', 'arhivat'))
    or (contact_row.lifecycle_status = 'de_contactat'
      and p_to_status in ('contactat', 'client_activ', 'in_asteptare', 'client_vechi', 'arhivat'))
    or (contact_row.lifecycle_status = 'contactat'
      and p_to_status in ('de_contactat', 'client_activ', 'in_asteptare', 'client_vechi', 'arhivat'))
    or (contact_row.lifecycle_status = 'client_activ'
      and p_to_status in ('contactat', 'in_asteptare', 'client_vechi', 'arhivat'))
    or (contact_row.lifecycle_status = 'in_asteptare'
      and p_to_status in ('de_contactat', 'contactat', 'client_activ', 'client_vechi', 'arhivat'))
    or (contact_row.lifecycle_status = 'client_vechi'
      and p_to_status in ('client_nou', 'de_contactat', 'contactat', 'client_activ', 'arhivat'))
    or (contact_row.lifecycle_status = 'arhivat'
      and p_to_status in ('client_nou', 'de_contactat', 'contactat', 'client_activ'))
  ) then
    raise exception 'invalid_contact_lifecycle_transition:%:%',
      contact_row.lifecycle_status, p_to_status;
  end if;

  blockers := public.crm_contact_lifecycle_blockers(
    p_agency_id, p_contact_id, p_to_status, now(), 60
  );
  if jsonb_array_length(blockers) > 0 then
    raise exception 'contact_lifecycle_blocked:%', blockers::text;
  end if;

  return public.crm_apply_contact_lifecycle(
    p_agency_id,
    p_contact_id,
    p_to_status,
    p_actor_id,
    p_reason,
    'manual',
    'manual-lifecycle:' || trim(p_idempotency_key),
    jsonb_build_object('actor_role', actor_role),
    now()
  );
end
$function$;

create or replace function public.crm_reactivate_contact_from_new_lead()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  contact_row public.contacts%rowtype;
begin
  if new.contact_id is null then return new; end if;
  select * into contact_row
  from public.contacts contact
  where contact.id = new.contact_id
    and contact.agency_id = new.agency_id
    and contact.deleted_at is null
    and coalesce(contact.merge_status, 'active') = 'active';
  if not found then return new; end if;

  if contact_row.lifecycle_status in ('client_vechi', 'arhivat') then
    perform public.crm_apply_contact_lifecycle(
      new.agency_id,
      new.contact_id,
      'client_nou',
      coalesce(new.responsible_agent_id, new.agent_id),
      'Clientul a revenit cu un lead nou.',
      'new_lead',
      'new-lead-reactivation:' || new.id::text,
      jsonb_build_object('lead_id', new.id, 'source', coalesce(new.source_normalized, new.source)),
      coalesce(new.received_at, new.created_at, now())
    );
  else
    update public.contacts
    set last_relevant_activity_at = greatest(
          coalesce(last_relevant_activity_at, '-infinity'::timestamptz),
          coalesce(new.received_at, new.created_at, now())
        ),
        agent_id = coalesce(
          agent_id,
          new.responsible_agent_id,
          new.agent_id
        )
    where id = new.contact_id and agency_id = new.agency_id;
  end if;
  return new;
end
$function$;

drop trigger if exists crm_reactivate_contact_from_new_lead_trigger on public.leads;
create trigger crm_reactivate_contact_from_new_lead_trigger
after insert on public.leads
for each row execute function public.crm_reactivate_contact_from_new_lead();

create or replace function public.crm_sync_contact_from_interaction()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  contact_row public.contacts%rowtype;
  target_status text;
begin
  if new.contact_id is null then return new; end if;
  select * into contact_row
  from public.contacts contact
  where contact.id = new.contact_id
    and contact.agency_id = new.agency_id
    and contact.deleted_at is null
    and coalesce(contact.merge_status, 'active') = 'active';
  if not found then return new; end if;

  target_status := contact_row.lifecycle_status;
  if new.successful
     and contact_row.lifecycle_status in (
       'client_nou', 'de_contactat', 'client_vechi', 'arhivat'
     ) then
    target_status := 'contactat';
  elsif not new.successful
     and contact_row.lifecycle_status in ('client_nou', 'client_vechi', 'arhivat') then
    target_status := 'de_contactat';
  end if;

  if target_status is distinct from contact_row.lifecycle_status then
    perform public.crm_apply_contact_lifecycle(
      new.agency_id,
      new.contact_id,
      target_status,
      new.agent_id,
      case when new.successful
        then 'Contact reușit documentat.'
        else 'Încercare de contact documentată.'
      end,
      'contact_interaction',
      'contact-interaction-lifecycle:' || new.id::text,
      jsonb_build_object(
        'lead_id', new.lead_id,
        'interaction_id', new.id,
        'outcome', new.outcome
      ),
      new.occurred_at
    );
  else
    update public.contacts
    set last_relevant_activity_at = greatest(
      coalesce(last_relevant_activity_at, '-infinity'::timestamptz),
      new.occurred_at
    )
    where id = new.contact_id and agency_id = new.agency_id;
  end if;
  return new;
end
$function$;

drop trigger if exists crm_sync_contact_from_interaction_trigger
  on public.lead_contact_interactions;
create trigger crm_sync_contact_from_interaction_trigger
after insert on public.lead_contact_interactions
for each row execute function public.crm_sync_contact_from_interaction();

create or replace function public.crm_activate_contact_from_business_record()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  is_active boolean := false;
  contact_row public.contacts%rowtype;
  occurred_at timestamptz := now();
begin
  if new.contact_id is null then return new; end if;

  if tg_table_name = 'demands' then
    is_active := coalesce(new.status, 'activa') not in (
      'inchisa', 'closed', 'finalizata', 'anulata', 'retrasa', 'respinsa'
    );
    occurred_at := coalesce(new.updated_at, now());
  elsif tg_table_name = 'calendar_events' then
    is_active := new.type = 'vizionare'
      and new.status in ('programata', 'confirmata', 'amanata')
      and new.start_at > now();
    occurred_at := coalesce(new.start_at, now());
  elsif tg_table_name = 'transactions' then
    is_active := coalesce(new.status, 'draft') not in ('finalizata', 'anulata');
    occurred_at := coalesce(new.created_at, now());
  end if;
  if not is_active then return new; end if;

  select * into contact_row
  from public.contacts contact
  where contact.id = new.contact_id
    and contact.agency_id = new.agency_id
    and contact.deleted_at is null
    and coalesce(contact.merge_status, 'active') = 'active';
  if not found then return new; end if;

  if contact_row.lifecycle_status is distinct from 'client_activ' then
    perform public.crm_apply_contact_lifecycle(
      new.agency_id,
      new.contact_id,
      'client_activ',
      coalesce(to_jsonb(new)->>'agent_id', to_jsonb(new)->>'created_by')::uuid,
      case tg_table_name
        when 'demands' then 'Cerere activă asociată clientului.'
        when 'calendar_events' then 'Vizionare viitoare asociată clientului.'
        else 'Tranzacție activă asociată clientului.'
      end,
      tg_table_name,
      'business-record-lifecycle:' || tg_table_name || ':' || new.id::text,
      jsonb_build_object('entity_type', tg_table_name, 'entity_id', new.id),
      occurred_at
    );
  end if;
  return new;
end
$function$;

drop trigger if exists crm_activate_contact_from_demand_trigger on public.demands;
create trigger crm_activate_contact_from_demand_trigger
after insert or update of status, contact_id on public.demands
for each row execute function public.crm_activate_contact_from_business_record();

drop trigger if exists crm_activate_contact_from_viewing_trigger on public.calendar_events;
create trigger crm_activate_contact_from_viewing_trigger
after insert or update of status, start_at, contact_id on public.calendar_events
for each row execute function public.crm_activate_contact_from_business_record();

drop trigger if exists crm_activate_contact_from_transaction_trigger on public.transactions;
create trigger crm_activate_contact_from_transaction_trigger
after insert or update of status, contact_id on public.transactions
for each row execute function public.crm_activate_contact_from_business_record();

create or replace function public.crm_refresh_contact_lifecycle(
  p_now timestamptz default now(),
  p_agency_id uuid default null,
  p_old_after_days integer default 60
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  contact_row record;
  blockers jsonb;
  changed_count integer := 0;
begin
  for contact_row in
    select contact.id, contact.agency_id,
      public.crm_contact_last_relevant_activity(contact.agency_id, contact.id) as last_activity
    from public.contacts contact
    where contact.deleted_at is null
      and coalesce(contact.merge_status, 'active') = 'active'
      and contact.lifecycle_status in (
        'de_contactat', 'contactat', 'client_activ', 'in_asteptare'
      )
      and (p_agency_id is null or contact.agency_id = p_agency_id)
  loop
    update public.contacts
    set last_relevant_activity_at = contact_row.last_activity
    where id = contact_row.id and agency_id = contact_row.agency_id;

    blockers := public.crm_contact_lifecycle_blockers(
      contact_row.agency_id,
      contact_row.id,
      'client_vechi',
      p_now,
      p_old_after_days
    );
    if jsonb_array_length(blockers) = 0 then
      perform public.crm_apply_contact_lifecycle(
        contact_row.agency_id,
        contact_row.id,
        'client_vechi',
        null,
        format(
          'Fără activitate relevantă de minimum %s zile și fără dosare deschise.',
          greatest(30, least(p_old_after_days, 365))
        ),
        'scheduled_lifecycle_review',
        'old-contact:' || contact_row.id::text || ':' ||
          to_char(p_now at time zone 'Europe/Bucharest', 'IYYY-IW'),
        jsonb_build_object('old_after_days', p_old_after_days),
        p_now
      );
      changed_count := changed_count + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'reviewed_at', p_now,
    'timezone', 'Europe/Bucharest',
    'old_after_days', greatest(30, least(p_old_after_days, 365)),
    'marked_old', changed_count
  );
end
$function$;

alter table public.contact_lifecycle_events enable row level security;
revoke all on table public.contact_lifecycle_events from public, anon, authenticated;
grant select on table public.contact_lifecycle_events to authenticated;
grant select, insert, update, delete on table public.contact_lifecycle_events to service_role;

drop policy if exists crm_contact_lifecycle_events_select
  on public.contact_lifecycle_events;
create policy crm_contact_lifecycle_events_select
on public.contact_lifecycle_events
for select to authenticated
using (
  agency_id = public.current_crm_agency_id()
  and exists (
    select 1
    from public.contacts contact
    where contact.id = contact_lifecycle_events.contact_id
      and contact.agency_id = contact_lifecycle_events.agency_id
      and public.crm_can_access_row(
        'contacts',
        array[contact.agent_id]::uuid[]
      )
  )
);

revoke all on function public.crm_contact_last_relevant_activity(uuid, uuid)
  from public, anon, authenticated;
revoke all on function public.crm_record_initial_contact_lifecycle()
  from public, anon, authenticated;
revoke all on function public.crm_contact_lifecycle_blockers(uuid, uuid, text, timestamptz, integer)
  from public, anon, authenticated;
revoke all on function public.crm_guard_contact_lifecycle_update()
  from public, anon, authenticated;
revoke all on function public.crm_apply_contact_lifecycle(
  uuid, uuid, text, uuid, text, text, text, jsonb, timestamptz
) from public, anon, authenticated;
revoke all on function public.crm_transition_contact_lifecycle(
  uuid, uuid, uuid, text, text, text
) from public, anon, authenticated;
revoke all on function public.crm_reactivate_contact_from_new_lead()
  from public, anon, authenticated;
revoke all on function public.crm_sync_contact_from_interaction()
  from public, anon, authenticated;
revoke all on function public.crm_activate_contact_from_business_record()
  from public, anon, authenticated;
revoke all on function public.crm_refresh_contact_lifecycle(timestamptz, uuid, integer)
  from public, anon, authenticated;

grant execute on function public.crm_contact_last_relevant_activity(uuid, uuid)
  to service_role;
grant execute on function public.crm_record_initial_contact_lifecycle()
  to service_role;
grant execute on function public.crm_contact_lifecycle_blockers(uuid, uuid, text, timestamptz, integer)
  to service_role;
grant execute on function public.crm_guard_contact_lifecycle_update()
  to service_role;
grant execute on function public.crm_apply_contact_lifecycle(
  uuid, uuid, text, uuid, text, text, text, jsonb, timestamptz
) to service_role;
grant execute on function public.crm_transition_contact_lifecycle(
  uuid, uuid, uuid, text, text, text
) to service_role;
grant execute on function public.crm_reactivate_contact_from_new_lead()
  to service_role;
grant execute on function public.crm_sync_contact_from_interaction()
  to service_role;
grant execute on function public.crm_activate_contact_from_business_record()
  to service_role;
grant execute on function public.crm_refresh_contact_lifecycle(timestamptz, uuid, integer)
  to service_role;

commit;
