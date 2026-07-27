-- Agent webmail: one-time personal addresses, tenant-scoped inboxes and
-- provider-independent delivery records.

begin;

insert into public.crm_role_permissions(role, module, action, allowed, updated_at)
select role_name, 'mail', action_name,
  case
    when role_name in ('owner', 'admin') then true
    when role_name = 'manager' then action_name <> 'manage_permissions'
    when role_name in ('agent_senior', 'agent', 'assistant', 'accountant')
      then action_name in ('view', 'create', 'edit')
    else false
  end,
  now()
from unnest(array[
  'owner', 'admin', 'manager', 'agent_senior', 'agent', 'assistant',
  'accountant', 'viewer'
]) as roles(role_name)
cross join unnest(array[
  'view', 'create', 'edit', 'delete', 'assign', 'export', 'manage_all',
  'view_financial', 'manage_permissions'
]) as actions(action_name)
on conflict (role, module, action) do update
set allowed = excluded.allowed, updated_at = excluded.updated_at;

with role_mail_permissions as (
  select role, jsonb_object_agg(action, allowed order by action) as permissions
  from public.crm_role_permissions
  where module = 'mail'
  group by role
)
update public.profiles profile
set permissions = coalesce(profile.permissions, '{}'::jsonb)
  || jsonb_build_object('mail', role_mail_permissions.permissions)
from role_mail_permissions
where role_mail_permissions.role = coalesce(profile.role, 'viewer')
  and not (coalesce(profile.permissions, '{}'::jsonb) ? 'mail');

create table if not exists public.crm_mailboxes (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  local_part text not null,
  domain text not null default 'kiraimobiliare.ro',
  address text not null,
  display_name text not null,
  status text not null default 'active',
  claimed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_mailboxes_user_unique unique (user_id),
  constraint crm_mailboxes_address_unique unique (address),
  constraint crm_mailboxes_id_agency_unique unique (id, agency_id),
  constraint crm_mailboxes_local_part_format check (
    local_part ~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$'
  ),
  constraint crm_mailboxes_domain_check check (domain = 'kiraimobiliare.ro'),
  constraint crm_mailboxes_address_check check (
    address = local_part || '@' || domain
  ),
  constraint crm_mailboxes_reserved_check check (
    local_part <> all(array[
      'abuse', 'admin', 'administrator', 'contact', 'documente', 'help',
      'info', 'mail', 'no-reply', 'noreply', 'office', 'postmaster',
      'rapoarte', 'root', 'security', 'support', 'webmaster', 'www'
    ])
  ),
  constraint crm_mailboxes_status_check check (
    status in ('active', 'disabled')
  )
);

create table if not exists public.crm_mail_messages (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  mailbox_id uuid not null references public.crm_mailboxes(id) on delete cascade,
  external_key text not null,
  direction text not null,
  folder text not null,
  provider text,
  provider_message_id text,
  internet_message_id text,
  thread_key text,
  in_reply_to text,
  from_email text not null,
  from_name text,
  to_emails jsonb not null default '[]'::jsonb,
  cc_emails jsonb not null default '[]'::jsonb,
  bcc_emails jsonb not null default '[]'::jsonb,
  reply_to_email text,
  subject text not null default '(Fără subiect)',
  text_body text not null default '',
  html_body text,
  snippet text not null default '',
  status text not null,
  error_code text,
  error_message text,
  read_at timestamptz,
  archived_at timestamptz,
  sent_at timestamptz,
  received_at timestamptz,
  contact_id uuid references public.contacts(id) on delete set null,
  lead_id uuid references public.leads(id) on delete set null,
  property_id uuid references public.properties(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint crm_mail_messages_id_agency_mailbox_unique
    unique (id, agency_id, mailbox_id),
  constraint crm_mail_messages_mailbox_agency_fk
    foreign key (mailbox_id, agency_id)
    references public.crm_mailboxes(id, agency_id) on delete cascade,
  constraint crm_mail_messages_external_unique unique (agency_id, external_key),
  constraint crm_mail_messages_direction_check check (
    direction in ('inbound', 'outbound')
  ),
  constraint crm_mail_messages_folder_check check (
    folder in ('inbox', 'sent', 'drafts', 'archive', 'spam', 'trash')
  ),
  constraint crm_mail_messages_status_check check (
    status in ('received', 'draft', 'queued', 'accepted', 'delivered', 'failed', 'bounced')
  ),
  constraint crm_mail_messages_subject_length check (char_length(subject) between 1 and 998),
  constraint crm_mail_messages_recipients_check check (
    jsonb_typeof(to_emails) = 'array'
    and jsonb_typeof(cc_emails) = 'array'
    and jsonb_typeof(bcc_emails) = 'array'
  )
);

create table if not exists public.crm_mail_attachments (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete cascade,
  mailbox_id uuid not null references public.crm_mailboxes(id) on delete cascade,
  message_id uuid not null references public.crm_mail_messages(id) on delete cascade,
  filename text not null,
  content_type text not null default 'application/octet-stream',
  size_bytes bigint not null default 0 check (size_bytes between 0 and 26214400),
  storage_path text,
  content_id text,
  disposition text not null default 'attachment',
  status text not null default 'available',
  created_at timestamptz not null default now(),
  constraint crm_mail_attachments_mailbox_agency_fk
    foreign key (mailbox_id, agency_id)
    references public.crm_mailboxes(id, agency_id) on delete cascade,
  constraint crm_mail_attachments_message_scope_fk
    foreign key (message_id, agency_id, mailbox_id)
    references public.crm_mail_messages(id, agency_id, mailbox_id) on delete cascade,
  constraint crm_mail_attachments_disposition_check check (
    disposition in ('attachment', 'inline')
  ),
  constraint crm_mail_attachments_status_check check (
    status in ('available', 'quarantined', 'failed')
  )
);

create index if not exists crm_mail_messages_folder_idx
  on public.crm_mail_messages(mailbox_id, folder, coalesce(received_at, sent_at, created_at) desc);
create index if not exists crm_mail_messages_unread_idx
  on public.crm_mail_messages(mailbox_id, received_at desc)
  where direction = 'inbound' and folder = 'inbox' and read_at is null;
create index if not exists crm_mail_messages_thread_idx
  on public.crm_mail_messages(agency_id, thread_key, created_at);
create unique index if not exists crm_mail_messages_provider_id_idx
  on public.crm_mail_messages(provider, provider_message_id)
  where provider_message_id is not null;
create index if not exists crm_mail_attachments_message_idx
  on public.crm_mail_attachments(message_id, created_at);

create or replace function public.crm_mailbox_identity_immutable()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.user_id is distinct from new.user_id
     or old.agency_id is distinct from new.agency_id
     or old.local_part is distinct from new.local_part
     or old.domain is distinct from new.domain
     or old.address is distinct from new.address
     or old.claimed_at is distinct from new.claimed_at then
    raise exception 'crm_mailbox_identity_is_immutable';
  end if;
  new.updated_at := now();
  return new;
end
$$;

drop trigger if exists crm_mailbox_identity_immutable_trigger on public.crm_mailboxes;
create trigger crm_mailbox_identity_immutable_trigger
before update on public.crm_mailboxes
for each row execute function public.crm_mailbox_identity_immutable();

create or replace function public.crm_claim_personal_mailbox(p_local_part text)
returns public.crm_mailboxes
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $$
declare
  user_uuid uuid := auth.uid();
  profile_row public.profiles%rowtype;
  mailbox_row public.crm_mailboxes%rowtype;
  normalized_part text := lower(trim(coalesce(p_local_part, '')));
  display_value text;
begin
  if user_uuid is null then
    raise exception 'crm_mailbox_authentication_required';
  end if;

  select * into profile_row
  from public.profiles
  where user_id = user_uuid and status = 'active'
  limit 1;
  if not found then
    raise exception 'crm_mailbox_active_profile_required';
  end if;

  select * into mailbox_row
  from public.crm_mailboxes
  where user_id = user_uuid
  limit 1;
  if found then
    return mailbox_row;
  end if;

  if not public.crm_has_permission('mail', 'create') then
    raise exception 'crm_mailbox_permission_denied';
  end if;
  if normalized_part !~ '^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$' then
    raise exception 'crm_mailbox_local_part_invalid';
  end if;
  if normalized_part = any(array[
    'abuse', 'admin', 'administrator', 'contact', 'documente', 'help',
    'info', 'mail', 'no-reply', 'noreply', 'office', 'postmaster',
    'rapoarte', 'root', 'security', 'support', 'webmaster', 'www'
  ]) then
    raise exception 'crm_mailbox_local_part_reserved';
  end if;

  display_value := coalesce(nullif(trim(profile_row.full_name), ''), normalized_part);
  begin
    insert into public.crm_mailboxes(
      agency_id, user_id, local_part, domain, address, display_name
    )
    values (
      profile_row.agency_id,
      user_uuid,
      normalized_part,
      'kiraimobiliare.ro',
      normalized_part || '@kiraimobiliare.ro',
      display_value
    )
    returning * into mailbox_row;
  exception
    when unique_violation then
      raise exception 'crm_mailbox_address_already_claimed';
  end;

  return mailbox_row;
end
$$;

revoke all on function public.crm_claim_personal_mailbox(text)
  from public, anon, authenticated;
grant execute on function public.crm_claim_personal_mailbox(text)
  to authenticated, service_role;

alter table public.crm_mailboxes enable row level security;
alter table public.crm_mail_messages enable row level security;
alter table public.crm_mail_attachments enable row level security;

do $security_gate$
declare
  table_name text;
begin
  if to_regprocedure('public.crm_session_authorized()') is not null then
    foreach table_name in array array[
      'crm_mailboxes', 'crm_mail_messages', 'crm_mail_attachments'
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

drop policy if exists crm_mailboxes_read on public.crm_mailboxes;
create policy crm_mailboxes_read on public.crm_mailboxes
for select to authenticated
using (
  agency_id = public.current_crm_agency_id()
  and (
    user_id = auth.uid()
    or public.crm_has_permission('mail', 'manage_all')
  )
);

drop policy if exists crm_mail_messages_read on public.crm_mail_messages;
create policy crm_mail_messages_read on public.crm_mail_messages
for select to authenticated
using (
  agency_id = public.current_crm_agency_id()
  and exists (
    select 1 from public.crm_mailboxes mailbox
    where mailbox.id = crm_mail_messages.mailbox_id
      and mailbox.agency_id = crm_mail_messages.agency_id
      and (
        mailbox.user_id = auth.uid()
        or public.crm_has_permission('mail', 'manage_all')
      )
  )
);

drop policy if exists crm_mail_attachments_read on public.crm_mail_attachments;
create policy crm_mail_attachments_read on public.crm_mail_attachments
for select to authenticated
using (
  agency_id = public.current_crm_agency_id()
  and exists (
    select 1 from public.crm_mailboxes mailbox
    where mailbox.id = crm_mail_attachments.mailbox_id
      and mailbox.agency_id = crm_mail_attachments.agency_id
      and (
        mailbox.user_id = auth.uid()
        or public.crm_has_permission('mail', 'manage_all')
      )
  )
);

revoke all on public.crm_mailboxes, public.crm_mail_messages, public.crm_mail_attachments
  from anon, authenticated;
grant select on public.crm_mailboxes, public.crm_mail_messages, public.crm_mail_attachments
  to authenticated;
grant all on public.crm_mailboxes, public.crm_mail_messages, public.crm_mail_attachments
  to service_role;

do $storage_bucket$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets(id, name, public)
    values ('crm-mail-attachments', 'crm-mail-attachments', false)
    on conflict (id) do update set public = false;
  end if;
end
$storage_bucket$;

commit;
