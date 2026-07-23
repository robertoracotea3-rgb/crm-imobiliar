do $$
begin
  if to_regprocedure('public.crm_sync_property_media(uuid,uuid,uuid,jsonb)') is not null then
    raise exception 'sync function survived rollback';
  end if;
  if to_regclass('public.property_media_cleanup_jobs') is null
    or not exists(select 1 from public.property_media_cleanup_jobs) then
    raise exception 'cleanup history was lost on rollback';
  end if;
  if to_regclass('public.property_media_events') is null
    or not exists(select 1 from public.property_media_events) then
    raise exception 'media audit history was lost on rollback';
  end if;
  if not exists(select 1 from public.property_photos where alt_text='Living luminos') then
    raise exception 'photo metadata was lost on rollback';
  end if;
end $$;
select 'phase13 rollback assertions passed' as result;
