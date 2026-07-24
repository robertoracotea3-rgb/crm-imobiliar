-- Operational extension 7/8: stable studio category and shared dynamic field
-- policy support. Apply after 20260724_270_demand_review_workflow.sql.

do $$
begin
  if exists (
    select 1
    from pg_type type
    join pg_namespace namespace on namespace.oid = type.typnamespace
    where namespace.nspname = 'public'
      and type.typname = 'property_category'
      and type.typtype = 'e'
  ) and not exists (
    select 1
    from pg_enum value
    join pg_type type on type.oid = value.enumtypid
    join pg_namespace namespace on namespace.oid = type.typnamespace
    where namespace.nspname = 'public'
      and type.typname = 'property_category'
      and value.enumlabel = 'studio_apartment'
  ) then
    alter type public.property_category add value 'studio_apartment';
  end if;
end
$$;

begin;

alter table public.demands
  drop constraint if exists demands_property_types_check;
alter table public.demands
  add constraint demands_property_types_check
  check (
    cardinality(property_types) > 0
    and property_types <@ array[
      'apartament',
      'studio_apartment',
      'casa_vila',
      'spatiu_comercial',
      'spatiu_industrial',
      'teren',
      'pensiune_hotel',
      'birou',
      'garaj'
    ]::text[]
  ) not valid;
alter table public.demands
  validate constraint demands_property_types_check;

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

comment on column public.properties.category is
  'Stable property type code. UI labels, dynamic fields and portal mappings are defined centrally; studio_apartment means Garsoniera.';

commit;
