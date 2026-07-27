begin;

drop function if exists public.crm_claim_personal_mailbox(text);
drop trigger if exists crm_mailbox_identity_immutable_trigger on public.crm_mailboxes;
drop function if exists public.crm_mailbox_identity_immutable();
drop table if exists public.crm_mail_attachments;
drop table if exists public.crm_mail_messages;
drop table if exists public.crm_mailboxes;

delete from public.crm_role_permissions where module = 'mail';
update public.profiles
set permissions = permissions - 'mail'
where jsonb_typeof(permissions) = 'object' and permissions ? 'mail';

commit;
