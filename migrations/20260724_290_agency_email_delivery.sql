-- Operational extension 9: tenant-scoped administrative email configuration
-- with provider acceptance, mailbox confirmation and delivery evidence.

begin;

create table if not exists public.agency_email_settings (
  agency_id uuid primary key references public.agencies(id) on delete cascade,
  documents_email text not null default 'documente@kiraimobiliare.ro',
  reports_email text not null default 'rapoarte@kiraimobiliare.ro',
  reply_to_email text not null default 'contact@kiraimobiliare.ro',
  sender_name text not null default 'Kira Imobiliare',
  provider text not null default 'resend',
  provider_domain_status text not null default 'unconfirmed',
  provider_domain_verified_at timestamptz,
  mailbox_status text not null default 'unconfirmed',
  mailbox_verified_at timestamptz,
  documents_verified_at timestamptz,
  reports_verified_at timestamptz,
  reply_to_verified_at timestamptz,
  mailbox_verified_by uuid references auth.users(id),
  last_test_recipient text,
  last_test_status text,
  last_test_provider_id text,
  last_test_accepted_at timestamptz,
  last_success_at timestamptz,
  last_error_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id),
  constraint agency_email_addresses_check check (
    documents_email ~* '^[^[:space:]@]+@kiraimobiliare[.]ro$'
    and reports_email ~* '^[^[:space:]@]+@kiraimobiliare[.]ro$'
    and reply_to_email ~* '^[^[:space:]@]+@kiraimobiliare[.]ro$'
  ),
  constraint agency_email_provider_check check (provider in ('resend')),
  constraint agency_email_domain_status_check check (
    provider_domain_status in ('unconfirmed', 'pending', 'verified', 'failed')
  ),
  constraint agency_email_mailbox_status_check check (
    mailbox_status in ('unconfirmed', 'accepted', 'verified', 'failed')
  ),
  constraint agency_email_test_status_check check (
    last_test_status is null or last_test_status in ('accepted', 'failed')
  )
);

create table if not exists public.email_delivery_logs (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  message_type text not null,
  recipient_email text not null,
  subject text not null,
  provider text not null,
  provider_message_id text,
  status text not null,
  attempt_number integer not null default 1 check (attempt_number between 1 and 20),
  idempotency_key text,
  error_code text,
  error_message text,
  metadata jsonb not null default '{}'::jsonb,
  accepted_at timestamptz,
  failed_at timestamptz,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  constraint email_delivery_status_check check (
    status in ('queued', 'accepted', 'delivered', 'failed', 'bounced')
  ),
  constraint email_delivery_subject_check check (char_length(subject) between 1 and 300)
);

create unique index if not exists email_delivery_idempotency_idx
  on public.email_delivery_logs(agency_id, idempotency_key)
  where idempotency_key is not null;
create index if not exists email_delivery_recent_idx
  on public.email_delivery_logs(agency_id, created_at desc);

alter table public.agency_email_settings enable row level security;
alter table public.email_delivery_logs enable row level security;

do $security_gate$
declare
  table_name text;
begin
  if to_regprocedure('public.crm_session_authorized()') is not null then
    foreach table_name in array array[
      'agency_email_settings',
      'email_delivery_logs'
    ] loop
      execute format(
        'drop policy if exists crm_account_security_gate on public.%I',
        table_name
      );
      execute format(
        'create policy crm_account_security_gate on public.%I as restrictive for all to authenticated using (public.crm_session_authorized()) with check (public.crm_session_authorized())',
        table_name
      );
    end loop;
  end if;
end
$security_gate$;

drop policy if exists agency_email_settings_read on public.agency_email_settings;
create policy agency_email_settings_read on public.agency_email_settings
  for select to authenticated
  using (agency_id = public.current_crm_agency_id());
drop policy if exists agency_email_settings_manage on public.agency_email_settings;
create policy agency_email_settings_manage on public.agency_email_settings
  for all to authenticated
  using (
    agency_id = public.current_crm_agency_id()
    and public.crm_has_permission('settings', 'edit')
  )
  with check (
    agency_id = public.current_crm_agency_id()
    and public.crm_has_permission('settings', 'edit')
  );

drop policy if exists email_delivery_logs_read on public.email_delivery_logs;
create policy email_delivery_logs_read on public.email_delivery_logs
  for select to authenticated
  using (
    agency_id = public.current_crm_agency_id()
    and public.crm_has_permission('settings', 'view')
  );

grant select on public.agency_email_settings, public.email_delivery_logs to authenticated;
grant insert, update on public.agency_email_settings to authenticated;
grant all on public.agency_email_settings, public.email_delivery_logs to service_role;

comment on column public.agency_email_settings.provider_domain_status is
  'Verified only from the email provider domain API; never inferred from an accepted message.';
comment on column public.agency_email_settings.mailbox_status is
  'Verified only after an owner/admin confirms that a recent test arrived in the configured mailbox.';

commit;
