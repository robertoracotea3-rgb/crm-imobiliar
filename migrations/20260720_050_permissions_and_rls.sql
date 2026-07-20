-- Phase 5: one permission model for API, UI and database row access.
-- Apply only after the application backup and on staging first.
-- This migration is additive, idempotent and preserves all historical rows.

begin;

alter table if exists public.profiles
  add column if not exists permissions jsonb;
alter table if exists public.profiles
  add column if not exists status text not null default 'active';
alter table if exists public.profiles
  add column if not exists disabled_at timestamptz;
alter table if exists public.profiles
  add column if not exists disabled_by uuid references auth.users(id);

create table if not exists public.crm_role_permissions (
  role text not null,
  module text not null,
  action text not null,
  allowed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (role, module, action)
);

create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  agency_id uuid references public.agencies(id),
  user_id uuid references auth.users(id),
  event_type text not null,
  module text,
  action text,
  entity_type text,
  entity_id uuid,
  route text,
  role text,
  result text not null,
  reason text,
  created_at timestamptz not null default now()
);

create index if not exists idx_security_events_agency_created
  on public.security_events(agency_id, created_at desc);
create index if not exists idx_security_events_user_created
  on public.security_events(user_id, created_at desc);

-- Seed helper used only to populate the normalized role matrix below.
create or replace function pg_temp.crm_seed_permission(
  p_role text,
  p_module text,
  p_action text
)
returns boolean
language plpgsql
immutable
as $$
begin
  if p_role = 'owner' then
    return true;
  end if;

  if p_role = 'admin' then
    if p_action = 'view_financial' then
      return p_module in ('dashboard', 'transactions', 'finance', 'reports');
    elsif p_action = 'manage_permissions' then
      return p_module = 'team';
    end if;
    return true;
  end if;

  if p_role = 'manager' then
    if p_action = 'view' then
      return p_module in ('dashboard','properties','contacts','leads','demands','viewings','calendar','tasks','prospects','notifications','transactions','finance','portals','feed','team','settings','reports');
    elsif p_action = 'create' then
      return p_module in ('properties','contacts','leads','demands','viewings','calendar','tasks','prospects','notifications','transactions','portals','feed');
    elsif p_action = 'edit' then
      return p_module in ('properties','contacts','leads','demands','viewings','calendar','tasks','prospects','notifications','transactions','portals','feed','team');
    elsif p_action = 'delete' then
      return false;
    elsif p_action = 'assign' then
      return p_module in ('properties','contacts','leads','demands','viewings','calendar','tasks','prospects','notifications','transactions','team');
    elsif p_action = 'export' then
      return p_module in ('dashboard','properties','contacts','leads','transactions','finance','reports');
    elsif p_action = 'manage_all' then
      return true;
    elsif p_action = 'view_financial' then
      return p_module in ('transactions','finance','reports');
    end if;
    return false;
  end if;

  if p_role in ('agent_senior', 'agent') then
    if p_action = 'view' then
      return p_module in ('dashboard','properties','contacts','leads','demands','viewings','calendar','tasks','prospects','notifications','transactions','reports');
    elsif p_action in ('create', 'edit') then
      return p_module in ('properties','contacts','leads','demands','viewings','calendar','tasks','prospects','notifications','transactions');
    elsif p_action = 'export' then
      return p_role = 'agent_senior' and p_module = 'properties';
    elsif p_action = 'view_financial' then
      return p_module = 'transactions';
    end if;
    return false;
  end if;

  if p_role = 'assistant' then
    if p_action = 'view' then
      return p_module in ('dashboard','properties','contacts','leads','demands','viewings','calendar','tasks','notifications');
    elsif p_action = 'create' then
      return p_module in ('contacts','demands','viewings','calendar','tasks','notifications');
    elsif p_action = 'edit' then
      return p_module in ('contacts','viewings','calendar','tasks','notifications');
    end if;
    return false;
  end if;

  if p_role = 'accountant' then
    if p_action = 'view' then
      return p_module in ('dashboard','transactions','finance','reports','notifications');
    elsif p_action = 'edit' then
      return p_module in ('transactions','notifications');
    elsif p_action = 'create' then
      return p_module = 'notifications';
    elsif p_action = 'export' or p_action = 'view_financial' then
      return p_module in ('transactions','finance','reports');
    elsif p_action = 'manage_all' then
      return p_module in ('dashboard','transactions','finance','reports');
    end if;
    return false;
  end if;

  if p_role = 'viewer' then
    if p_action = 'view' or p_action = 'manage_all' then
      return p_module in ('dashboard','properties','reports');
    end if;
    return false;
  end if;

  return false;
end;
$$;

with roles(role) as (
  values ('owner'),('admin'),('manager'),('agent_senior'),('agent'),('assistant'),('accountant'),('viewer')
), modules(module) as (
  values ('dashboard'),('properties'),('contacts'),('leads'),('demands'),('viewings'),('calendar'),('tasks'),('prospects'),('notifications'),('transactions'),('finance'),('portals'),('feed'),('team'),('settings'),('reports')
), actions(action) as (
  values ('view'),('create'),('edit'),('delete'),('assign'),('export'),('manage_all'),('view_financial'),('manage_permissions')
)
insert into public.crm_role_permissions(role, module, action, allowed, updated_at)
select role, module, action, pg_temp.crm_seed_permission(role, module, action), now()
from roles cross join modules cross join actions
on conflict (role, module, action) do update
set allowed = excluded.allowed, updated_at = excluded.updated_at;

-- Backfill a complete, explicit permission document for every existing profile.
-- From this point the profile JSON is the common source read by UI, API and RLS.
update public.profiles p
set permissions = u.raw_user_meta_data -> 'permissions'
from auth.users u
where u.id = p.user_id
  and p.permissions is null
  and jsonb_typeof(u.raw_user_meta_data -> 'permissions') = 'object';

with permission_modules as (
  select role, module, jsonb_object_agg(action, allowed order by action) as actions
  from public.crm_role_permissions
  group by role, module
), permission_roles as (
  select role, jsonb_object_agg(module, actions order by module) as permissions
  from permission_modules
  group by role
)
update public.profiles p
set permissions = r.permissions
from permission_roles r
where r.role = coalesce(p.role, 'viewer')
  and p.permissions is null;

create or replace function public.current_crm_agency_id()
returns uuid
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select agency_id from public.profiles
  where user_id = auth.uid() and coalesce(status, 'active') = 'active'
  limit 1
$$;

create or replace function public.current_crm_role()
returns text
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(role, 'viewer') from public.profiles
  where user_id = auth.uid() and coalesce(status, 'active') = 'active'
  limit 1
$$;

create or replace function public.crm_has_permission(p_module text, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select coalesce(
    case
      when jsonb_typeof(p.permissions #> array[p_module, p_action]) = 'boolean'
        then (p.permissions #>> array[p_module, p_action])::boolean
      else null
    end,
    rp.allowed,
    false
  )
  from public.profiles p
  left join public.crm_role_permissions rp
    on rp.role = coalesce(p.role, 'viewer')
   and rp.module = p_module
   and rp.action = p_action
  where p.user_id = auth.uid()
    and coalesce(p.status, 'active') = 'active'
  limit 1
$$;

create or replace function public.crm_can_access_row(p_module text, p_owner_ids uuid[])
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select public.crm_has_permission(p_module, 'manage_all')
    or auth.uid() = any(coalesce(p_owner_ids, array[]::uuid[]))
$$;

create or replace function public.crm_can_access_property(p_property_id uuid, p_action text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.properties p
    where p.id = p_property_id
      and p.agency_id = public.current_crm_agency_id()
      and public.crm_has_permission('properties', p_action)
      and public.crm_can_access_row('properties', array[p.agent_id]::uuid[])
  )
$$;

revoke all on function public.current_crm_agency_id() from public, anon;
revoke all on function public.current_crm_role() from public, anon;
revoke all on function public.crm_has_permission(text, text) from public, anon;
revoke all on function public.crm_can_access_row(text, uuid[]) from public, anon;
revoke all on function public.crm_can_access_property(uuid, text) from public, anon;
grant execute on function public.current_crm_agency_id() to authenticated, service_role;
grant execute on function public.current_crm_role() to authenticated, service_role;
grant execute on function public.crm_has_permission(text, text) to authenticated, service_role;
grant execute on function public.crm_can_access_row(text, uuid[]) to authenticated, service_role;
grant execute on function public.crm_can_access_property(uuid, text) to authenticated, service_role;

alter table public.crm_role_permissions enable row level security;
alter table public.security_events enable row level security;
revoke all on public.crm_role_permissions from anon, authenticated;
revoke all on public.security_events from anon, authenticated;
grant select on public.crm_role_permissions to authenticated;
grant select on public.security_events to authenticated;

drop policy if exists crm_role_permissions_read on public.crm_role_permissions;
create policy crm_role_permissions_read on public.crm_role_permissions
  for select to authenticated
  using (role = public.current_crm_role() or public.crm_has_permission('team', 'manage_permissions'));

drop policy if exists crm_security_events_read on public.security_events;
create policy crm_security_events_read on public.security_events
  for select to authenticated
  using (
    agency_id = public.current_crm_agency_id()
    and public.crm_has_permission('team', 'manage_all')
  );

-- Profiles and agency identity have deliberately narrower policies than the
-- generic business tables. Role and permission writes remain server-only.
alter table if exists public.agencies enable row level security;
alter table if exists public.profiles enable row level security;
revoke all on public.agencies from anon;
revoke all on public.profiles from anon;
grant select, update on public.agencies to authenticated;
grant select on public.profiles to authenticated;

drop policy if exists crm_agencies_same_agency on public.agencies;
drop policy if exists crm_agencies_select on public.agencies;
drop policy if exists crm_agencies_update on public.agencies;
create policy crm_agencies_select on public.agencies
  for select to authenticated
  using (id = public.current_crm_agency_id());
create policy crm_agencies_update on public.agencies
  for update to authenticated
  using (id = public.current_crm_agency_id() and public.crm_has_permission('settings', 'edit'))
  with check (id = public.current_crm_agency_id() and public.crm_has_permission('settings', 'edit'));

drop policy if exists crm_profiles_same_agency on public.profiles;
drop policy if exists crm_profiles_select on public.profiles;
create policy crm_profiles_select on public.profiles
  for select to authenticated
  using (
    agency_id = public.current_crm_agency_id()
    and (user_id = auth.uid() or public.crm_has_permission('team', 'manage_all'))
  );

-- Business rows are visible/editable only inside the agency and, for ordinary
-- users, only when created by or assigned to that user.
do $$
declare
  cfg record;
  policy_prefix text;
begin
  for cfg in
    select * from (values
      ('properties',      'properties',   'array[agent_id]::uuid[]',                  'agent_id'),
      ('contacts',        'contacts',     'array[agent_id, created_by]::uuid[]',      'agent_id'),
      ('demands',         'demands',      'array[agent_id]::uuid[]',                  'agent_id'),
      ('leads',           'leads',        'array[agent_id, assigned_to]::uuid[]',     'agent_id'),
      ('calendar_events', 'calendar',     'array[agent_id, created_by]::uuid[]',      'agent_id'),
      ('tasks',           'tasks',        'array[assigned_to, created_by]::uuid[]',   'assigned_to'),
      ('prospects',       'prospects',    'array[assigned_to]::uuid[]',               'assigned_to'),
      ('transactions',    'transactions', 'array[agent_id, created_by]::uuid[]',      'agent_id'),
      ('activities',      'leads',        'array[agent_id, user_id]::uuid[]',         'user_id'),
      ('activity_logs',   'reports',      'array[user_id]::uuid[]',                   'user_id')
    ) as scoped(table_name, module_name, owner_expression, assignee_column)
  loop
    if to_regclass('public.' || cfg.table_name) is null then
      continue;
    end if;

    execute format('alter table public.%I enable row level security', cfg.table_name);
    execute format('revoke all on public.%I from anon', cfg.table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', cfg.table_name);
    policy_prefix := 'crm_' || cfg.table_name;

    execute format('drop policy if exists %I on public.%I', policy_prefix || '_agency_scope', cfg.table_name);
    execute format('drop policy if exists %I on public.%I', policy_prefix || '_select', cfg.table_name);
    execute format('drop policy if exists %I on public.%I', policy_prefix || '_insert', cfg.table_name);
    execute format('drop policy if exists %I on public.%I', policy_prefix || '_update', cfg.table_name);
    execute format('drop policy if exists %I on public.%I', policy_prefix || '_delete', cfg.table_name);

    execute format(
      'create policy %I on public.%I for select to authenticated using (agency_id = public.current_crm_agency_id() and public.crm_has_permission(%L, ''view'') and public.crm_can_access_row(%L, %s))',
      policy_prefix || '_select', cfg.table_name, cfg.module_name, cfg.module_name, cfg.owner_expression
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated with check (agency_id = public.current_crm_agency_id() and public.crm_has_permission(%L, ''create'') and (public.crm_has_permission(%L, ''manage_all'') or public.crm_has_permission(%L, ''assign'') or %I = auth.uid()))',
      policy_prefix || '_insert', cfg.table_name, cfg.module_name, cfg.module_name, cfg.module_name, cfg.assignee_column
    );
    execute format(
      'create policy %I on public.%I for update to authenticated using (agency_id = public.current_crm_agency_id() and public.crm_has_permission(%L, ''edit'') and public.crm_can_access_row(%L, %s)) with check (agency_id = public.current_crm_agency_id() and public.crm_has_permission(%L, ''edit'') and (public.crm_has_permission(%L, ''manage_all'') or public.crm_has_permission(%L, ''assign'') or %I = auth.uid()))',
      policy_prefix || '_update', cfg.table_name, cfg.module_name, cfg.module_name, cfg.owner_expression,
      cfg.module_name, cfg.module_name, cfg.module_name, cfg.assignee_column
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated using (agency_id = public.current_crm_agency_id() and public.crm_has_permission(%L, ''delete'') and public.crm_can_access_row(%L, %s))',
      policy_prefix || '_delete', cfg.table_name, cfg.module_name, cfg.module_name, cfg.owner_expression
    );
  end loop;
end $$;

-- Child resources inherit access from their property.
do $$
declare
  tbl_name text;
begin
  foreach tbl_name in array array['property_documents', 'portal_listings'] loop
    if to_regclass('public.' || tbl_name) is null then continue; end if;
    execute format('alter table public.%I enable row level security', tbl_name);
    execute format('revoke all on public.%I from anon', tbl_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', tbl_name);
    execute format('drop policy if exists %I on public.%I', 'crm_' || tbl_name || '_agency_scope', tbl_name);
    execute format('drop policy if exists %I on public.%I', 'crm_' || tbl_name || '_select', tbl_name);
    execute format('drop policy if exists %I on public.%I', 'crm_' || tbl_name || '_insert', tbl_name);
    execute format('drop policy if exists %I on public.%I', 'crm_' || tbl_name || '_update', tbl_name);
    execute format('drop policy if exists %I on public.%I', 'crm_' || tbl_name || '_delete', tbl_name);
    execute format('create policy %I on public.%I for select to authenticated using (agency_id = public.current_crm_agency_id() and public.crm_can_access_property(property_id, ''view''))', 'crm_' || tbl_name || '_select', tbl_name);
    execute format('create policy %I on public.%I for insert to authenticated with check (agency_id = public.current_crm_agency_id() and public.crm_can_access_property(property_id, ''edit''))', 'crm_' || tbl_name || '_insert', tbl_name);
    execute format('create policy %I on public.%I for update to authenticated using (agency_id = public.current_crm_agency_id() and public.crm_can_access_property(property_id, ''edit'')) with check (agency_id = public.current_crm_agency_id() and public.crm_can_access_property(property_id, ''edit''))', 'crm_' || tbl_name || '_update', tbl_name);
    execute format('create policy %I on public.%I for delete to authenticated using (agency_id = public.current_crm_agency_id() and public.crm_can_access_property(property_id, ''delete''))', 'crm_' || tbl_name || '_delete', tbl_name);
  end loop;
end $$;

-- Agency-wide configuration resources are restricted to users with manage_all.
do $$
declare
  cfg record;
begin
  for cfg in
    select * from (values
      ('portal_tokens', 'portals'),
      ('message_templates', 'settings')
    ) as managed(table_name, module_name)
  loop
    if to_regclass('public.' || cfg.table_name) is null then continue; end if;
    execute format('alter table public.%I enable row level security', cfg.table_name);
    execute format('revoke all on public.%I from anon', cfg.table_name);
    execute format('grant select, insert, update, delete on public.%I to authenticated', cfg.table_name);
    execute format('drop policy if exists %I on public.%I', 'crm_' || cfg.table_name || '_agency_scope', cfg.table_name);
    execute format('drop policy if exists %I on public.%I', 'crm_' || cfg.table_name || '_managed', cfg.table_name);
    execute format(
      'create policy %I on public.%I for all to authenticated using (agency_id = public.current_crm_agency_id() and public.crm_has_permission(%L, ''manage_all'')) with check (agency_id = public.current_crm_agency_id() and public.crm_has_permission(%L, ''manage_all''))',
      'crm_' || cfg.table_name || '_managed', cfg.table_name, cfg.module_name, cfg.module_name
    );
  end loop;
end $$;

commit;
