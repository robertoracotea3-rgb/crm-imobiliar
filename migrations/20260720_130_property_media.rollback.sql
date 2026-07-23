begin;

drop function if exists public.crm_finish_property_media_cleanup(uuid,uuid,boolean,text,timestamptz);
drop function if exists public.crm_claim_property_media_cleanup(uuid,integer);
drop function if exists public.crm_sync_property_media(uuid,uuid,uuid,jsonb);
drop function if exists public.crm_property_photo_path(text);

-- Metadata and queued cleanup work are historical records. They are retained
-- when used and can be processed again after reapplying the migration.
do $$
begin
  if to_regclass('public.property_media_events') is not null
    and not exists(select 1 from public.property_media_events) then
    drop table public.property_media_events;
  end if;
  if to_regclass('public.property_media_cleanup_jobs') is not null
    and not exists(select 1 from public.property_media_cleanup_jobs) then
    drop table public.property_media_cleanup_jobs;
  end if;
end $$;

commit;
