-- Operational extension 2: deterministic Storia lead association and immutable
-- property snapshots. Apply after 20260724_220_property_assignments.sql.

begin;

alter table public.leads
  add column if not exists property_public_code text;
alter table public.leads
  add column if not exists property_public_url text;
alter table public.leads
  add column if not exists property_main_photo_url text;
alter table public.leads
  add column if not exists property_price numeric;
alter table public.leads
  add column if not exists property_currency text;
alter table public.leads
  add column if not exists responsible_agent_id uuid references auth.users(id);
alter table public.leads
  add column if not exists assigned_at timestamptz;
alter table public.leads
  add column if not exists first_contact_due_at timestamptz;
alter table public.leads
  add column if not exists lead_assignment_status text;

create or replace function public.crm_public_slug(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select trim(both '-' from regexp_replace(
    translate(
      lower(coalesce(trim(p_value), '')),
      'ăâîșşțţĂÂÎȘŞȚŢ',
      'aaissttaaisstt'
    ),
    '[^a-z0-9]+',
    '-',
    'g'
  ))
$$;

create or replace function public.crm_public_property_url(
  p_property_id uuid,
  p_internal_code text,
  p_category text,
  p_city text
)
returns text
language sql
immutable
parallel safe
set search_path = public, pg_temp
as $$
  select 'https://www.kiraimobiliare.ro/proprietati/' ||
    public.crm_public_slug(
      case p_category
        when 'apartament' then 'Apartament'
        when 'studio_apartment' then 'Garsoniera'
        when 'casa_vila' then 'Casa Vila'
        when 'teren' then 'Teren'
        when 'spatiu_comercial' then 'Spatiu Comercial'
        when 'spatiu_industrial' then 'Spatiu Industrial'
        when 'birou' then 'Birou'
        when 'pensiune_hotel' then 'Pensiune Hotel'
        when 'garaj' then 'Garaj'
        else coalesce(nullif(p_category, ''), 'proprietate')
      end
    ) || '-' ||
    public.crm_public_slug(coalesce(nullif(p_city, ''), 'fagaras')) || '-' ||
    lower(coalesce(nullif(p_internal_code, ''), left(p_property_id::text, 8)))
$$;

update public.leads lead
set property_title = coalesce(lead.property_title, property.title),
    property_public_code = coalesce(lead.property_public_code, property.internal_code),
    property_public_url = coalesce(
      lead.property_public_url,
      public.crm_public_property_url(
        property.id,
        property.internal_code,
        property.category::text,
        property.city
      )
    ),
    property_price = coalesce(lead.property_price, property.price),
    property_currency = coalesce(lead.property_currency, property.currency),
    responsible_agent_id = coalesce(
      lead.responsible_agent_id,
      lead.agent_id,
      property.responsible_agent_id,
      property.agent_id
    ),
    assigned_at = case
      when coalesce(
        lead.responsible_agent_id,
        lead.agent_id,
        property.responsible_agent_id,
        property.agent_id
      ) is not null
        then coalesce(lead.assigned_at, lead.received_at, now())
      else null
    end,
    first_contact_due_at = case
      when coalesce(
        lead.responsible_agent_id,
        lead.agent_id,
        property.responsible_agent_id,
        property.agent_id
      ) is not null
        then coalesce(
          lead.first_contact_due_at,
          coalesce(lead.assigned_at, lead.received_at, now()) + interval '24 hours'
        )
      else null
    end,
    lead_assignment_status = case
      when coalesce(
        lead.responsible_agent_id,
        lead.agent_id,
        property.responsible_agent_id,
        property.agent_id
      ) is null then 'pending_owner'
      else 'assigned'
    end
from public.properties property
where property.id = lead.property_id
  and property.agency_id = lead.agency_id;

update public.leads
set responsible_agent_id = agent_id,
    assigned_at = case
      when agent_id is not null then coalesce(assigned_at, received_at, now())
      else null
    end,
    first_contact_due_at = case
      when agent_id is not null
        then coalesce(first_contact_due_at, coalesce(assigned_at, received_at, now()) + interval '24 hours')
      else null
    end,
    lead_assignment_status = case when agent_id is null then 'pending_owner' else 'assigned' end
where property_id is null
  and (
    responsible_agent_id is null
    or assigned_at is null
    or lead_assignment_status is null
  );

do $media_backfill$
begin
  if to_regclass('public.property_photos') is not null then
    update public.leads lead
    set property_main_photo_url = (
      select photo.public_url
      from public.property_photos photo
      where photo.property_id = lead.property_id
        and photo.agency_id = lead.agency_id
        and photo.deleted_at is null
        and photo.public_url is not null
      order by photo.is_cover desc, photo.sort_order, photo.created_at, photo.id
      limit 1
    )
    where lead.property_main_photo_url is null
      and exists (
        select 1
        from public.property_photos photo
        where photo.property_id = lead.property_id
          and photo.agency_id = lead.agency_id
          and photo.deleted_at is null
          and photo.public_url is not null
      );
  end if;
end
$media_backfill$;

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'leads_assignment_status_check'
      and conrelid = 'public.leads'::regclass
  ) then
    alter table public.leads add constraint leads_assignment_status_check
      check (lead_assignment_status in ('assigned', 'pending_owner'))
      not valid;
  end if;
end
$constraints$;

alter table public.leads validate constraint leads_assignment_status_check;

create index if not exists leads_responsible_agent_idx
  on public.leads(agency_id, responsible_agent_id, received_at desc)
  where deleted_at is null;
create index if not exists leads_pending_owner_idx
  on public.leads(agency_id, received_at desc)
  where deleted_at is null and lead_assignment_status = 'pending_owner';
create index if not exists leads_first_contact_due_idx
  on public.leads(agency_id, first_contact_due_at)
  where deleted_at is null and first_contact_due_at is not null;

create or replace function public.crm_validate_lead_assignment()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $function$
declare
  property_row record;
  property_changed boolean;
  assignment_changed boolean;
begin
  property_changed := tg_op = 'INSERT';
  assignment_changed := tg_op = 'INSERT';
  if tg_op = 'INSERT' then
    new.responsible_agent_id := coalesce(new.responsible_agent_id, new.agent_id);
  else
    property_changed := new.property_id is distinct from old.property_id;
    if new.agent_id is distinct from old.agent_id
       and new.responsible_agent_id is not distinct from old.responsible_agent_id then
      new.responsible_agent_id := new.agent_id;
    end if;
    assignment_changed :=
      new.responsible_agent_id is distinct from old.responsible_agent_id;
  end if;

  if new.property_id is not null and property_changed then
    select
      property.id,
      property.agency_id,
      property.title,
      property.internal_code,
      property.category,
      property.city,
      property.price,
      property.currency,
      coalesce(property.responsible_agent_id, property.agent_id) as responsible_agent_id
    into property_row
    from public.properties property
    where property.id = new.property_id
      and property.deleted_at is null;

    if property_row.id is null or property_row.agency_id <> new.agency_id then
      raise exception 'lead_property_outside_agency_or_missing';
    end if;

    new.property_title := property_row.title;
    new.property_public_code := property_row.internal_code;
    new.property_public_url := public.crm_public_property_url(
      property_row.id,
      property_row.internal_code,
      property_row.category::text,
      property_row.city
    );
    new.property_price := property_row.price;
    new.property_currency := property_row.currency;

    if tg_op = 'INSERT'
       or coalesce(new.source_normalized, new.source, '') in ('storia', 'olx', 'storia_olx') then
      new.responsible_agent_id := property_row.responsible_agent_id;
      new.agent_id := property_row.responsible_agent_id;
      assignment_changed := true;
    end if;

    if to_regclass('public.property_photos') is not null then
      select photo.public_url
      into new.property_main_photo_url
      from public.property_photos photo
      where photo.property_id = new.property_id
        and photo.agency_id = new.agency_id
        and photo.deleted_at is null
        and photo.public_url is not null
      order by photo.is_cover desc, photo.sort_order, photo.created_at, photo.id
      limit 1;
    end if;
  end if;

  if new.responsible_agent_id is not null and not exists (
    select 1
    from public.profiles profile
    where profile.user_id = new.responsible_agent_id
      and profile.agency_id = new.agency_id
      and coalesce(profile.status, 'active') = 'active'
  ) then
    raise exception 'lead_agent_not_active_in_agency';
  end if;

  new.agent_id := new.responsible_agent_id;
  new.lead_assignment_status := case
    when new.responsible_agent_id is null then 'pending_owner'
    else 'assigned'
  end;

  if assignment_changed then
    new.assigned_at := case
      when new.responsible_agent_id is null then null
      else now()
    end;
    new.first_contact_due_at := case
      when new.responsible_agent_id is null then null
      else now() + interval '24 hours'
    end;
  end if;

  return new;
end
$function$;

drop trigger if exists crm_validate_lead_assignment_trigger on public.leads;
create trigger crm_validate_lead_assignment_trigger
before insert or update of property_id, agent_id, responsible_agent_id
on public.leads
for each row execute function public.crm_validate_lead_assignment();

revoke all on function public.crm_validate_lead_assignment() from public, anon, authenticated;
grant execute on function public.crm_validate_lead_assignment() to service_role;

comment on column public.leads.property_public_code is
  'Immutable property code snapshot captured when the lead is associated.';
comment on column public.leads.property_public_url is
  'Immutable public-site URL snapshot captured when the lead is associated.';
comment on column public.leads.property_main_photo_url is
  'Immutable cover-photo URL snapshot captured when the lead is associated.';

commit;
