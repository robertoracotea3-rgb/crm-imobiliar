-- Phase 25 rollback: disable the new enforcement while preserving security history.

begin;

do $security_gate$
declare table_name text;
begin
  for table_name in
    select class.relname
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relkind in ('r', 'p')
  loop
    execute format('drop policy if exists crm_account_security_gate on public.%I', table_name);
  end loop;
end
$security_gate$;

do $storage_security_gate$
begin
  if to_regclass('storage.objects') is not null then
    execute 'drop policy if exists crm_account_security_gate on storage.objects';
  end if;
end
$storage_security_gate$;

revoke all on function public.crm_auth_rate_limit_check(text, text)
  from public, anon, authenticated, service_role;
revoke all on function public.crm_auth_rate_limit_record(text, text, boolean)
  from public, anon, authenticated, service_role;
revoke all on function public.crm_authorize_app_session(
  uuid, uuid, text, timestamptz, timestamptz, text, text, boolean
) from public, anon, authenticated, service_role;
revoke all on function public.crm_revoke_user_sessions(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.crm_prepare_password_change(uuid, uuid, uuid, text)
  from public, anon, authenticated, service_role;
revoke all on function public.crm_complete_password_change(uuid, uuid)
  from public, anon, authenticated, service_role;
revoke all on function public.crm_session_authorized()
  from public, anon, authenticated, service_role;

drop function if exists public.crm_auth_rate_limit_check(text, text);
drop function if exists public.crm_auth_rate_limit_record(text, text, boolean);
drop function if exists public.crm_authorize_app_session(
  uuid, uuid, text, timestamptz, timestamptz, text, text, boolean
);
drop function if exists public.crm_revoke_user_sessions(uuid, uuid, uuid, text);
drop function if exists public.crm_prepare_password_change(uuid, uuid, uuid, text);
drop function if exists public.crm_complete_password_change(uuid, uuid);
drop function if exists public.crm_session_authorized();

-- Tables and profile columns are retained deliberately for audit and a safe retry.
commit;
