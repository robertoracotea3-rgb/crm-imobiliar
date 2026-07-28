-- Allow the agency owner/admin to claim the shared office address while
-- keeping every other system alias reserved.

begin;

alter table public.crm_mailboxes
  drop constraint if exists crm_mailboxes_reserved_check;
alter table public.crm_mailboxes
  add constraint crm_mailboxes_reserved_check check (
    local_part <> all(array[
      'abuse', 'admin', 'administrator', 'contact', 'documente', 'help',
      'info', 'mail', 'no-reply', 'noreply', 'postmaster', 'rapoarte',
      'root', 'security', 'support', 'webmaster', 'www'
    ])
  );

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
  ]) and not (
    normalized_part = 'office'
    and profile_row.role in ('owner', 'admin')
  ) then
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

commit;
