do $$
begin
  if to_regprocedure('public.crm_sweep_due_automations(timestamptz,uuid)') is not null then
    raise exception 'sweep function survived rollback';
  end if;
  if to_regprocedure('public.crm_claim_automation_jobs(integer,uuid)') is not null then
    raise exception 'claim function survived rollback';
  end if;
  if to_regclass('public.automation_run_logs') is null then
    raise exception 'audit history was deleted by rollback';
  end if;
  if exists(select 1 from public.automation_jobs where status in ('pending','processing','retry')) then
    raise exception 'executable work survived rollback';
  end if;
end
$$;

select 'phase19 rollback assertions passed' as result;
