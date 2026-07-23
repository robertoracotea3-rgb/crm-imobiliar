\set ON_ERROR_STOP on

do $$
begin
  if to_regprocedure('public.crm_session_authorized()') is not null then
    raise exception 'Session gate function survived rollback';
  end if;
  if to_regprocedure('public.crm_prepare_password_change(uuid,uuid,uuid,text)') is not null
    or to_regprocedure('public.crm_complete_password_change(uuid,uuid)') is not null
    or to_regprocedure('public.crm_revoke_user_sessions(uuid,uuid,uuid,text)') is not null then
    raise exception 'Password security functions survived rollback';
  end if;
  if exists(
    select 1 from pg_policies where policyname = 'crm_account_security_gate'
  ) then
    raise exception 'Restrictive account policy survived rollback';
  end if;
  if to_regclass('public.crm_user_sessions') is null then
    raise exception 'Session history was destroyed by rollback';
  end if;
end
$$;

select 'phase25_account_security_rollback_ok';
