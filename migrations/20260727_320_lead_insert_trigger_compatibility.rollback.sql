begin;

create or replace function public.crm_record_initial_pipeline_stage()
returns trigger
language plpgsql
security invoker
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

commit;
