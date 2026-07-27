\set ON_ERROR_STOP on

do $assertions$
declare
  agent_uuid uuid := '10000000-0000-0000-0000-000000000001';
  agency_uuid uuid := '20000000-0000-0000-0000-000000000001';
  mailbox_row public.crm_mailboxes%rowtype;
  duplicate_failed boolean := false;
  immutable_failed boolean := false;
begin
  insert into public.agencies(id, name)
  values (agency_uuid, 'Phase 37 Agency')
  on conflict (id) do nothing;
  insert into auth.users(id, email) values
    (agent_uuid, 'phase37-agent@fortis.crm'),
    ('10000000-0000-0000-0000-000000000002', 'phase37-second@fortis.crm')
  on conflict (id) do nothing;
  insert into public.profiles(user_id, agency_id, role, full_name, status)
  values (agent_uuid, agency_uuid, 'agent', 'Roberto Test', 'active')
  on conflict (user_id, agency_id) do update
  set role = excluded.role, full_name = excluded.full_name, status = excluded.status;

  if to_regclass('public.crm_mailboxes') is null
     or to_regclass('public.crm_mail_messages') is null
     or to_regclass('public.crm_mail_attachments') is null then
    raise exception 'agent_webmail_tables_missing';
  end if;

  if not exists (
    select 1 from public.crm_role_permissions
    where role = 'agent' and module = 'mail' and action = 'create' and allowed
  ) then
    raise exception 'agent_mail_permission_missing';
  end if;

  perform set_config(
    'request.jwt.claims',
    jsonb_build_object('sub', agent_uuid::text)::text,
    true
  );
  select * into mailbox_row from public.crm_claim_personal_mailbox('roberto.test');
  if mailbox_row.address <> 'roberto.test@kiraimobiliare.ro'
     or mailbox_row.agency_id <> agency_uuid
     or mailbox_row.user_id <> agent_uuid then
    raise exception 'mailbox_claim_invalid';
  end if;

  select * into mailbox_row from public.crm_claim_personal_mailbox('another-name');
  if mailbox_row.address <> 'roberto.test@kiraimobiliare.ro' then
    raise exception 'mailbox_claim_was_not_one_time';
  end if;

  begin
    insert into public.crm_mailboxes(
      agency_id, user_id, local_part, address, display_name
    ) values (
      agency_uuid,
      '10000000-0000-0000-0000-000000000002',
      'roberto.test',
      'roberto.test@kiraimobiliare.ro',
      'Duplicate'
    );
  exception when unique_violation then
    duplicate_failed := true;
  end;
  if not duplicate_failed then
    raise exception 'duplicate_mailbox_was_accepted';
  end if;

  begin
    update public.crm_mailboxes
    set local_part = 'changed', address = 'changed@kiraimobiliare.ro'
    where id = mailbox_row.id;
  exception when others then
    immutable_failed := sqlerrm like '%crm_mailbox_identity_is_immutable%';
  end;
  if not immutable_failed then
    raise exception 'mailbox_identity_was_mutable';
  end if;

  insert into public.crm_mail_messages(
    agency_id, mailbox_id, external_key, direction, folder, from_email,
    to_emails, subject, text_body, snippet, status, received_at
  ) values (
    agency_uuid, mailbox_row.id, 'integration-message-1', 'inbound', 'inbox',
    'client@example.com', '["roberto.test@kiraimobiliare.ro"]'::jsonb,
    'Cerere apartament', 'Bună ziua', 'Bună ziua', 'received', now()
  )
  on conflict (agency_id, external_key) do nothing;

  if not exists (
    select 1 from public.crm_mail_messages
    where mailbox_id = mailbox_row.id and status = 'received'
  ) then
    raise exception 'mail_message_insert_failed';
  end if;
end
$assertions$;

select 'phase37_agent_webmail_ok';
