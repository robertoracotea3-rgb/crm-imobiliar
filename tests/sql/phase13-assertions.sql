do $$
declare result jsonb;
begin
  if (select count(*) from public.property_photos
    where property_id='aaaaaaaa-2000-0000-0000-000000000001' and deleted_at is null)<>3 then
    raise exception 'historical photo URLs were not backfilled';
  end if;
  if (select count(*) from public.property_photos
    where property_id='aaaaaaaa-2000-0000-0000-000000000001'
      and deleted_at is null and is_cover)<>1 then
    raise exception 'cover normalization failed';
  end if;
  if exists(select 1 from public.property_photos where agency_id is null) then
    raise exception 'agency backfill failed';
  end if;

  result:=public.crm_sync_property_media(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'aaaaaaaa-2000-0000-0000-000000000001',
    'aaaaaaaa-1000-0000-0000-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'url','https://test.supabase.co/storage/v1/object/public/property-photos/aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-2000-0000-0000-000000000001/hash-3/medium.webp',
        'storage_path','aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-2000-0000-0000-000000000001/hash-3/medium.webp',
        'alt_text','Living luminos','description','Imagine principală','variants','{}'::jsonb
      ),
      jsonb_build_object(
        'url','https://test.supabase.co/storage/v1/object/public/property-photos/aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-2000-0000-0000-000000000001/hash-1/medium.webp',
        'storage_path','aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-2000-0000-0000-000000000001/hash-1/medium.webp',
        'alt_text','Dormitor','variants','{}'::jsonb
      )
    )
  );
  if result->>'active_photos'<>'2' or result->>'cleanup_jobs'<>'1' then
    raise exception 'gallery sync summary invalid: %',result;
  end if;
  if (select storage_path from public.property_photos
      where property_id='aaaaaaaa-2000-0000-0000-000000000001' and is_cover and deleted_at is null)
    not like '%/hash-3/medium.webp' then raise exception 'reorder/cover failed'; end if;
  if (select alt_text from public.property_photos
      where property_id='aaaaaaaa-2000-0000-0000-000000000001'
        and storage_path like '%/hash-3/medium.webp' and deleted_at is null)<>'Living luminos' then
    raise exception 'alt text was not stored';
  end if;
  if (select attributes->'photos'->>0 from public.properties
      where id='aaaaaaaa-2000-0000-0000-000000000001') not like '%/hash-3/medium.webp' then
    raise exception 'legacy photo array order was not synchronized';
  end if;
  if (select status from public.property_media_cleanup_jobs
      where property_id='aaaaaaaa-2000-0000-0000-000000000001')<>'pending' then
    raise exception 'removed file was not queued after database sync';
  end if;

  -- Re-adding a photo before cleanup cancels the physical deletion.
  perform public.crm_sync_property_media(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'aaaaaaaa-2000-0000-0000-000000000001',
    'aaaaaaaa-1000-0000-0000-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'url','https://test.supabase.co/storage/v1/object/public/property-photos/aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-2000-0000-0000-000000000001/hash-3/medium.webp',
        'storage_path','aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-2000-0000-0000-000000000001/hash-3/medium.webp',
        'alt_text','Living luminos','variants','{}'::jsonb
      ),
      jsonb_build_object(
        'url','https://test.supabase.co/storage/v1/object/public/property-photos/aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-2000-0000-0000-000000000001/hash-1/medium.webp',
        'storage_path','aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-2000-0000-0000-000000000001/hash-1/medium.webp',
        'alt_text','Dormitor','variants','{}'::jsonb
      ),
      jsonb_build_object(
        'url','https://test.supabase.co/storage/v1/object/public/property-photos/aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-2000-0000-0000-000000000001/hash-2/medium.webp',
        'storage_path','aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-2000-0000-0000-000000000001/hash-2/medium.webp',
        'alt_text','Bucătărie','variants','{}'::jsonb
      )
    )
  );
  if exists(select 1 from public.property_media_cleanup_jobs where status<>'cancelled') then
    raise exception 're-added media cleanup was not cancelled';
  end if;

  -- Editing without uploads can remove the photo again and then cleanup retries.
  perform public.crm_sync_property_media(
    'aaaaaaaa-0000-0000-0000-000000000001',
    'aaaaaaaa-2000-0000-0000-000000000001',
    'aaaaaaaa-1000-0000-0000-000000000001',
    jsonb_build_array(
      jsonb_build_object(
        'url','https://test.supabase.co/storage/v1/object/public/property-photos/aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-2000-0000-0000-000000000001/hash-3/medium.webp',
        'storage_path','aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-2000-0000-0000-000000000001/hash-3/medium.webp',
        'alt_text','Living luminos','variants','{}'::jsonb
      ),
      jsonb_build_object(
        'url','https://test.supabase.co/storage/v1/object/public/property-photos/aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-2000-0000-0000-000000000001/hash-1/medium.webp',
        'storage_path','aaaaaaaa-0000-0000-0000-000000000001/aaaaaaaa-2000-0000-0000-000000000001/hash-1/medium.webp',
        'alt_text','Dormitor','variants','{}'::jsonb
      )
    )
  );
end $$;

create temporary table claimed_cleanup as
select * from public.crm_claim_property_media_cleanup('aaaaaaaa-0000-0000-0000-000000000001',10);

do $$
declare job_id uuid; finish_status text;
begin
  select id into job_id from claimed_cleanup limit 1;
  if job_id is null then raise exception 'cleanup was not claimable after the DB commit'; end if;
  finish_status:=public.crm_finish_property_media_cleanup(
    'aaaaaaaa-0000-0000-0000-000000000001',job_id,false,'temporary failure',now()
  );
  if finish_status<>'retry' then raise exception 'cleanup retry failed'; end if;
  perform * from public.crm_claim_property_media_cleanup('aaaaaaaa-0000-0000-0000-000000000001',10);
  finish_status:=public.crm_finish_property_media_cleanup(
    'aaaaaaaa-0000-0000-0000-000000000001',job_id,true,null,null
  );
  if finish_status<>'confirmed' then raise exception 'cleanup confirmation failed'; end if;
  if (select cleanup_status from public.property_photos where storage_path like '%/hash-2/medium.webp')<>'deleted' then
    raise exception 'photo metadata cleanup was not confirmed';
  end if;

  begin
    perform public.crm_sync_property_media(
      'aaaaaaaa-0000-0000-0000-000000000001',
      'bbbbbbbb-2000-0000-0000-000000000001',
      'aaaaaaaa-1000-0000-0000-000000000001','[]'::jsonb
    );
    raise exception 'cross-tenant media edit was accepted';
  exception when others then
    if sqlerrm='cross-tenant media edit was accepted' then raise; end if;
  end;
end $$;

set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-1000-0000-0000-000000000001',false);
do $$
begin
  if exists(select 1 from public.property_photos
    where agency_id='bbbbbbbb-0000-0000-0000-000000000001') then
    raise exception 'RLS exposed another agency';
  end if;
  if not exists(select 1 from public.property_photos
    where agency_id='aaaaaaaa-0000-0000-0000-000000000001') then
    raise exception 'RLS hid own agency';
  end if;
end $$;
reset role;
select set_config('request.jwt.claim.sub','',false);

select 'phase13 assertions passed' as result;
