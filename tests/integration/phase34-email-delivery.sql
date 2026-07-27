\set ON_ERROR_STOP on

begin;

insert into auth.users(id,email) values
  ('34000000-0000-4000-8000-000000000001','owner34@example.invalid'),
  ('34000000-0000-4000-8000-000000000002','other34@example.invalid');
insert into public.agencies(id,name) values
  ('34000000-0000-4000-8000-000000000010','Agency 34'),
  ('34000000-0000-4000-8000-000000000011','Other Agency 34');
insert into public.profiles(user_id,agency_id,role,full_name,status) values
  ('34000000-0000-4000-8000-000000000001','34000000-0000-4000-8000-000000000010','owner','Owner 34','active'),
  ('34000000-0000-4000-8000-000000000002','34000000-0000-4000-8000-000000000011','owner','Other 34','active');
insert into public.crm_user_sessions(
  session_id,user_id,agency_id,aal,created_at,last_seen_at,token_expires_at
) values (
  '34000000-0000-4000-8000-000000000090',
  '34000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000010',
  'aal2',
  now(),
  now(),
  now() + interval '1 hour'
);

insert into public.agency_email_settings(
  agency_id,documents_email,reports_email,reply_to_email,sender_name
) values
  (
    '34000000-0000-4000-8000-000000000010',
    'documente@kiraimobiliare.ro',
    'rapoarte@kiraimobiliare.ro',
    'contact@kiraimobiliare.ro',
    'Agency 34'
  ),
  (
    '34000000-0000-4000-8000-000000000011',
    'documente@kiraimobiliare.ro',
    'rapoarte@kiraimobiliare.ro',
    'contact@kiraimobiliare.ro',
    'Other Agency 34'
  );

insert into public.email_delivery_logs(
  agency_id,message_type,recipient_email,subject,provider,status,idempotency_key
) values
  (
    '34000000-0000-4000-8000-000000000010',
    'configuration_test',
    'documente@kiraimobiliare.ro',
    'Test agency 34',
    'resend',
    'accepted',
    'phase34-agency'
  ),
  (
    '34000000-0000-4000-8000-000000000011',
    'configuration_test',
    'rapoarte@kiraimobiliare.ro',
    'Test other 34',
    'resend',
    'accepted',
    'phase34-other'
  );

select set_config(
  'request.jwt.claims',
  '{"sub":"34000000-0000-4000-8000-000000000001","session_id":"34000000-0000-4000-8000-000000000090","aal":"aal2"}',
  true
);
set local role authenticated;

do $$
declare
  visible_settings integer;
  visible_logs integer;
  resolved_agency uuid;
begin
  select count(*) into visible_settings from public.agency_email_settings;
  select count(*) into visible_logs from public.email_delivery_logs;
  select public.current_crm_agency_id() into resolved_agency;
  if visible_settings <> 1 then
    raise exception
      'email_settings_cross_tenant_read: visible=%, resolved_agency=%',
      visible_settings, resolved_agency;
  end if;
  if visible_logs <> 1 then
    raise exception
      'email_delivery_log_cross_tenant_read: visible=%, resolved_agency=%',
      visible_logs, resolved_agency;
  end if;
  update public.agency_email_settings
  set sender_name = 'Agency 34 updated'
  where agency_id = '34000000-0000-4000-8000-000000000010';
  if not found then
    raise exception 'owner_cannot_update_email_settings';
  end if;
end
$$;

reset role;
rollback;

select 'phase34_email_delivery_ok';
