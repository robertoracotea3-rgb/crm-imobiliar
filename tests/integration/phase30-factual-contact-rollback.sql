\set ON_ERROR_STOP on

do $test$
begin
  if to_regprocedure(
    'public.crm_record_lead_contact(uuid,uuid,uuid,text,text,text,text,uuid,numeric,numeric,text,text,text,text,timestamp with time zone,timestamp with time zone,text)'
  ) is not null then
    raise exception 'factual_contact_rpc_remained_after_rollback';
  end if;
  if exists (
    select 1 from pg_trigger
    where tgname = 'crm_enforce_contact_evidence_trigger'
      and not tgisinternal
  ) then
    raise exception 'contact_evidence_trigger_remained_after_rollback';
  end if;
  if to_regclass('public.lead_contact_interactions') is null then
    raise exception 'rollback_deleted_contact_history';
  end if;
  if to_regprocedure(
    'public.record_whatsapp_outcome(uuid,uuid,uuid,text,timestamp with time zone)'
  ) is null then
    raise exception 'rollback_removed_corrected_whatsapp_function';
  end if;
end
$test$;

select 'phase30_factual_contact_rollback_ok' as result;
