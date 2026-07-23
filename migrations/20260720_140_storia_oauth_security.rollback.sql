-- Emergency rollback for Phase 15.
-- Encrypted credentials and audit history are deliberately retained: removing
-- those columns would destroy the only usable copy of a connected account.

begin;

drop function if exists public.crm_revoke_portal_connection(uuid,text,uuid,text);
drop function if exists public.crm_record_legacy_token_encryption(uuid,text,uuid);
drop function if exists public.crm_fail_portal_token_refresh(uuid,text,uuid,text,boolean);
drop function if exists public.crm_complete_portal_token_refresh(uuid,text,uuid,text,text,text,timestamptz,text);
drop function if exists public.crm_claim_portal_token_refresh(uuid,text,uuid);
drop function if exists public.crm_fail_portal_oauth(uuid,text);
drop function if exists public.crm_complete_portal_oauth(uuid,text,text,text,text,timestamptz,text);
drop function if exists public.crm_consume_portal_oauth_session(text,text);

-- Pending states can be removed safely; consumed states and audit events remain
-- available for incident investigation and a later re-apply.
delete from public.portal_oauth_sessions where status in ('pending','expired','cancelled');
do $$
begin
  if to_regclass('public.portal_token_events') is not null
    and not exists(select 1 from public.portal_token_events) then
    drop table public.portal_token_events;
  end if;
  if to_regclass('public.portal_oauth_sessions') is not null
    and not exists(select 1 from public.portal_oauth_sessions) then
    drop table public.portal_oauth_sessions;
  end if;
end
$$;

commit;
