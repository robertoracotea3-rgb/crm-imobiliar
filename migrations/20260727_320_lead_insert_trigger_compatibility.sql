-- Hosted legacy databases do not all expose leads.created_at. Keep the
-- lifecycle timestamp compatible and let the server-only pipeline history
-- trigger write with its narrowly scoped owner privileges.

begin;

create or replace function public.crm_record_initial_pipeline_stage()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
begin
  insert into public.lead_pipeline_events(
    agency_id, lead_id, from_stage, to_stage, reason, note, source,
    evidence, dedup_key, created_at
  ) values (
    new.agency_id,
    new.id,
    null,
    new.pipeline_stage,
    'Lead creat',
    concat('Status inițial păstrat: ', coalesce(new.status, '—')),
    'system',
    jsonb_build_object('legacy_status', new.status),
    'initial-stage',
    coalesce(new.received_at, now())
  )
  on conflict(agency_id, lead_id, dedup_key) do nothing;
  return new;
end
$function$;

revoke all on function public.crm_record_initial_pipeline_stage()
  from public, anon, authenticated;
grant execute on function public.crm_record_initial_pipeline_stage()
  to service_role;

create or replace function public.crm_reactivate_contact_from_new_lead()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  contact_row public.contacts%rowtype;
  lead_occurred_at timestamptz;
begin
  if new.contact_id is null then return new; end if;
  lead_occurred_at := coalesce(
    new.received_at,
    nullif(to_jsonb(new) ->> 'created_at', '')::timestamptz,
    now()
  );
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
      jsonb_build_object(
        'lead_id', new.id,
        'source', coalesce(new.source_normalized, new.source)
      ),
      lead_occurred_at
    );
  else
    update public.contacts
    set last_relevant_activity_at = greatest(
          coalesce(last_relevant_activity_at, '-infinity'::timestamptz),
          lead_occurred_at
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

commit;
