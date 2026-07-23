\set ON_ERROR_STOP on

do $$
declare
  integrity jsonb;
begin
  if (select count(*) from public.crm_audit_log) <> 2 then
    raise exception 'reapplying the audit migration changed historical rows';
  end if;
  integrity := public.crm_verify_audit_chain('00000000-0000-4000-8000-000000000011');
  if not coalesce((integrity ->> 'valid')::boolean, false) then
    raise exception 'reapplying the audit migration broke the hash chain';
  end if;
end
$$;

select 'phase23_audit_idempotency_ok' as marker;
