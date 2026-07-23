-- Emergency rollback for Phase 18. Historical statuses are never rewritten.

begin;

drop trigger if exists crm_require_transaction_reservation_evidence_trigger on public.transactions;
drop function if exists public.crm_require_transaction_reservation_evidence();
drop trigger if exists crm_record_initial_pipeline_stage_trigger on public.leads;
drop function if exists public.crm_record_initial_pipeline_stage();
drop trigger if exists crm_guard_pipeline_stage_update_trigger on public.leads;
drop function if exists public.crm_guard_pipeline_stage_update();
drop function if exists public.crm_transition_lead_pipeline(uuid,uuid,uuid,text,timestamptz,text,text,text);
drop function if exists public.crm_pipeline_stage_blockers(uuid,uuid,text,timestamptz,text,text,text);
drop function if exists public.crm_record_lead_property_share(uuid,uuid,uuid,uuid,text,text,text);

do $$
begin
  if not exists(select 1 from public.transactions where reservation_at is not null or reservation_amount is not null) then
    alter table public.transactions drop constraint if exists transactions_reservation_amount_nonnegative;
    alter table public.transactions drop column if exists reservation_at;
    alter table public.transactions drop column if exists reservation_amount;
  end if;

  if to_regclass('public.lead_pipeline_events') is not null
    and not exists(select 1 from public.lead_pipeline_events where source<>'migration') then
    drop table public.lead_pipeline_events;
  end if;
  if to_regclass('public.lead_property_shares') is not null
    and not exists(select 1 from public.lead_property_shares) then
    drop table public.lead_property_shares;
  end if;

  if to_regclass('public.lead_pipeline_events') is null
    and to_regclass('public.lead_property_shares') is null then
    alter table public.leads drop column if exists pipeline_stage_changed_at;
    alter table public.leads drop column if exists pipeline_legacy_status;
    alter table public.leads drop column if exists pipeline_stage;
    drop table if exists public.lead_pipeline_transitions;
    drop table if exists public.lead_pipeline_stages;
  end if;
end
$$;

commit;
