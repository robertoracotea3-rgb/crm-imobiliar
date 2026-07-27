\set ON_ERROR_STOP on

do $assertions$
begin
  if to_regclass('public.prospects') is not null
     or to_regclass('public.prospect_source_health') is not null
     or to_regclass('public.prospect_sync_runs') is not null then
    raise exception 'retired_prospect_tables_survived';
  end if;

  if to_regprocedure('public.crm_prospect_match_key(text)') is not null
     or to_regprocedure('public.crm_sync_prospect_fields()') is not null
     or to_regprocedure('public.crm_mark_missing_prospects(uuid,text,text[],timestamp with time zone)') is not null
     or to_regprocedure('public.crm_refresh_prospect_duplicate_groups(uuid)') is not null then
    raise exception 'retired_prospect_functions_survived';
  end if;

  if exists (
    select 1 from public.crm_role_permissions where module = 'prospects'
  ) then
    raise exception 'retired_prospect_permissions_survived';
  end if;

  if exists (
    select 1 from public.profiles
    where jsonb_typeof(permissions) = 'object' and permissions ? 'prospects'
  ) then
    raise exception 'retired_profile_permissions_survived';
  end if;

  if to_regclass('public.properties') is null
     or to_regclass('public.contacts') is null
     or to_regclass('public.leads') is null
     or to_regclass('public.demands') is null
     or to_regclass('public.transactions') is null then
    raise exception 'core_crm_table_was_removed';
  end if;
end
$assertions$;

select 'phase36_prospects_removal_ok';
