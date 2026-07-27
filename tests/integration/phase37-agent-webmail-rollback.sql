\set ON_ERROR_STOP on

do $assertions$
begin
  if to_regclass('public.crm_mailboxes') is not null
     or to_regclass('public.crm_mail_messages') is not null
     or to_regclass('public.crm_mail_attachments') is not null then
    raise exception 'agent_webmail_tables_survived_rollback';
  end if;
  if to_regprocedure('public.crm_claim_personal_mailbox(text)') is not null then
    raise exception 'agent_webmail_function_survived_rollback';
  end if;
  if exists (select 1 from public.crm_role_permissions where module = 'mail') then
    raise exception 'agent_webmail_permissions_survived_rollback';
  end if;
end
$assertions$;

select 'phase37_agent_webmail_rollback_ok';
