-- Remove the retired "Anunțuri particulari" module after a verified backup.
-- Historical audit/security events are intentionally preserved.

begin;

update public.profiles
set permissions = permissions - 'prospects'
where jsonb_typeof(permissions) = 'object'
  and permissions ? 'prospects';

delete from public.crm_role_permissions
where module = 'prospects';

do $retire_prospects$
begin
  if to_regclass('public.prospects') is not null then
    drop trigger if exists crm_sync_prospect_fields_trigger on public.prospects;
  end if;
end
$retire_prospects$;

drop function if exists public.crm_refresh_prospect_duplicate_groups(uuid);
drop function if exists public.crm_mark_missing_prospects(uuid,text,text[],timestamptz);
drop function if exists public.crm_sync_prospect_fields();
drop function if exists public.crm_prospect_match_key(text);

drop table if exists public.prospect_sync_runs;
drop table if exists public.prospect_source_health;
drop table if exists public.prospects;

delete from public.crm_system_service_health
where service_code in (
  'imports.olx',
  'imports.publi24',
  'imports.homezz',
  'imports.romimo'
);

commit;
