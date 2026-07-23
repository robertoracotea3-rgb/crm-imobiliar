begin;

alter table public.property_photos add column if not exists agency_id uuid references public.agencies(id);
alter table public.property_photos add column if not exists public_url text;
alter table public.property_photos add column if not exists hash text;
alter table public.property_photos add column if not exists alt_text text not null default '';
alter table public.property_photos add column if not exists description text;
alter table public.property_photos add column if not exists mime_type text;
alter table public.property_photos add column if not exists file_size bigint;
alter table public.property_photos add column if not exists variants jsonb not null default '{}'::jsonb;
alter table public.property_photos add column if not exists upload_status text not null default 'ready';
alter table public.property_photos add column if not exists cleanup_status text not null default 'active';
alter table public.property_photos add column if not exists uploaded_by uuid references auth.users(id);
alter table public.property_photos add column if not exists deleted_at timestamptz;
alter table public.property_photos add column if not exists deleted_by uuid references auth.users(id);
alter table public.property_photos add column if not exists updated_at timestamptz not null default now();

update public.property_photos media
set agency_id=property.agency_id
from public.properties property
where property.id=media.property_id and media.agency_id is null;

update public.property_photos
set hash=nullif(split_part(storage_path,'/',3),'')
where hash is null and array_length(string_to_array(storage_path,'/'),1)>=4;

-- Duplicate metadata is retained for audit but only the newest row remains active.
with ranked as (
  select id,row_number() over(
    partition by property_id,storage_path order by created_at desc nulls last,id desc
  ) as row_number
  from public.property_photos where deleted_at is null
)
update public.property_photos media
set deleted_at=now(),cleanup_status='duplicate_metadata',is_cover=false,updated_at=now()
from ranked
where ranked.id=media.id and ranked.row_number>1;

create unique index if not exists property_photos_active_path_uidx
  on public.property_photos(property_id,storage_path) where deleted_at is null;

create or replace function public.crm_property_photo_path(p_url text)
returns text language sql immutable parallel safe as $$
  select case
    when p_url like '%/property-photos/%'
      then nullif(regexp_replace(split_part(split_part(p_url,'?',1),'#',1),'^.*/property-photos/',''),'')
    else null
  end
$$;

-- Rebuild the media catalog from the non-destructive historical URL array.
with attribute_media as (
  select property.id as property_id,property.agency_id,photo.url,photo.ordinality,
    public.crm_property_photo_path(photo.url) as storage_path
  from public.properties property
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(property.attributes->'photos')='array'
      then property.attributes->'photos' else '[]'::jsonb end
  ) with ordinality as photo(url,ordinality)
  where property.deleted_at is null
)
update public.property_photos media
set public_url=attribute_media.url,
    sort_order=(attribute_media.ordinality-1)::integer,
    agency_id=attribute_media.agency_id,
    updated_at=now()
from attribute_media
where media.property_id=attribute_media.property_id
  and media.storage_path=attribute_media.storage_path
  and media.deleted_at is null;

insert into public.property_photos(
  agency_id,property_id,storage_path,public_url,hash,sort_order,is_cover,
  is_private,is_floorplan,is_360,alt_text,upload_status,cleanup_status
)
select media.agency_id,media.property_id,media.storage_path,media.url,
  nullif(split_part(media.storage_path,'/',3),''),
  (media.ordinality-1)::integer,media.ordinality=1,
  false,false,false,'','ready','active'
from (
  select property.id as property_id,property.agency_id,photo.url,photo.ordinality,
    public.crm_property_photo_path(photo.url) as storage_path
  from public.properties property
  cross join lateral jsonb_array_elements_text(
    case when jsonb_typeof(property.attributes->'photos')='array'
      then property.attributes->'photos' else '[]'::jsonb end
  ) with ordinality as photo(url,ordinality)
  where property.deleted_at is null
) media
where media.storage_path is not null
  and media.storage_path like media.agency_id::text||'/'||media.property_id::text||'/%'
on conflict(property_id,storage_path) where deleted_at is null do update
set public_url=excluded.public_url,sort_order=excluded.sort_order,agency_id=excluded.agency_id,updated_at=now();

-- Exactly the first active image is the cover.
with ranked as (
  select id,row_number() over(
    partition by property_id order by sort_order,created_at,id
  ) as row_number
  from public.property_photos where deleted_at is null
)
update public.property_photos media
set is_cover=ranked.row_number=1,updated_at=now()
from ranked where ranked.id=media.id and media.is_cover is distinct from (ranked.row_number=1);

create unique index if not exists property_photos_one_cover_uidx
  on public.property_photos(property_id) where is_cover and deleted_at is null;
create index if not exists property_photos_gallery_idx
  on public.property_photos(agency_id,property_id,sort_order) where deleted_at is null;
create index if not exists property_photos_cleanup_idx
  on public.property_photos(agency_id,cleanup_status,deleted_at) where deleted_at is not null;

alter table public.property_photos alter column agency_id set not null;
alter table public.property_photos drop constraint if exists property_photos_file_size_check;
alter table public.property_photos add constraint property_photos_file_size_check
  check(file_size is null or file_size between 0 and 10485760) not valid;
alter table public.property_photos validate constraint property_photos_file_size_check;
alter table public.property_photos drop constraint if exists property_photos_alt_text_check;
alter table public.property_photos add constraint property_photos_alt_text_check
  check(length(alt_text)<=160 and (description is null or length(description)<=500)) not valid;
alter table public.property_photos validate constraint property_photos_alt_text_check;
alter table public.property_photos drop constraint if exists property_photos_status_check;
alter table public.property_photos add constraint property_photos_status_check
  check(upload_status in ('ready','failed')
    and cleanup_status in ('active','pending','processing','retry','deleted','failed','duplicate_metadata')) not valid;
alter table public.property_photos validate constraint property_photos_status_check;

create table if not exists public.property_media_cleanup_jobs(
  id uuid primary key default gen_random_uuid(),
  agency_id uuid not null references public.agencies(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  photo_id uuid references public.property_photos(id) on delete set null,
  storage_path text not null,
  reason text not null,
  status text not null default 'pending'
    check(status in ('pending','processing','retry','confirmed','failed','cancelled')),
  attempts integer not null default 0 check(attempts>=0),
  max_attempts integer not null default 8 check(max_attempts between 1 and 20),
  next_attempt_at timestamptz not null default now(),
  started_at timestamptz,
  confirmed_at timestamptz,
  last_error text,
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index if not exists property_media_cleanup_photo_uidx
  on public.property_media_cleanup_jobs(photo_id) where photo_id is not null;
create unique index if not exists property_media_cleanup_orphan_uidx
  on public.property_media_cleanup_jobs(agency_id,property_id,storage_path)
  where photo_id is null and status in ('pending','processing','retry','failed');
create index if not exists property_media_cleanup_due_idx
  on public.property_media_cleanup_jobs(agency_id,next_attempt_at)
  where status in ('pending','retry');

create table if not exists public.property_media_events(
  id bigint generated always as identity primary key,
  agency_id uuid not null references public.agencies(id) on delete restrict,
  property_id uuid not null references public.properties(id) on delete restrict,
  actor_id uuid references auth.users(id),
  event_type text not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists property_media_events_property_idx
  on public.property_media_events(property_id,created_at desc);

create or replace function public.crm_sync_property_media(
  p_agency_id uuid,p_property_id uuid,p_actor_id uuid,p_media jsonb
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  property_row public.properties%rowtype;
  media_item jsonb;
  media_order bigint;
  path_value text;
  url_value text;
  photo_urls jsonb;
  removed_count integer:=0;
  active_count integer:=0;
begin
  if not exists(select 1 from public.profiles where user_id=p_actor_id and agency_id=p_agency_id
    and coalesce(status,'active')='active') then raise exception 'property_media_actor_not_in_agency'; end if;
  select * into property_row from public.properties
  where id=p_property_id and agency_id=p_agency_id and deleted_at is null for update;
  if not found then raise exception 'property_media_property_not_found'; end if;
  if jsonb_typeof(p_media)<>'array' then raise exception 'property_media_array_required'; end if;
  if jsonb_array_length(p_media)>60 then raise exception 'property_media_limit_exceeded'; end if;
  if (select count(*) from jsonb_array_elements(p_media))
    <> (select count(distinct value->>'storage_path') from jsonb_array_elements(p_media)) then
    raise exception 'property_media_duplicate_path';
  end if;

  for media_item,media_order in
    select value,ordinality from jsonb_array_elements(p_media) with ordinality
  loop
    path_value:=media_item->>'storage_path';
    url_value:=media_item->>'url';
    if path_value is null
      or path_value not like p_agency_id::text||'/'||p_property_id::text||'/%'
      or public.crm_property_photo_path(url_value) is distinct from path_value then
      raise exception 'property_media_path_invalid';
    end if;
    if length(coalesce(media_item->>'alt_text',''))>160
      or length(coalesce(media_item->>'description',''))>500 then
      raise exception 'property_media_text_too_long';
    end if;
  end loop;

  -- A file re-added before cleanup reactivates its newest metadata row.
  with incoming as (
    select value,ordinality from jsonb_array_elements(p_media) with ordinality
  ), candidates as (
    select distinct on(media.storage_path) media.id,incoming.value,incoming.ordinality
    from public.property_photos media join incoming
      on incoming.value->>'storage_path'=media.storage_path
    where media.agency_id=p_agency_id and media.property_id=p_property_id and media.deleted_at is not null
      and not exists(select 1 from public.property_photos active
        where active.property_id=media.property_id and active.storage_path=media.storage_path
          and active.deleted_at is null)
    order by media.storage_path,media.deleted_at desc,media.id desc
  )
  update public.property_photos media
  set public_url=candidates.value->>'url',sort_order=(candidates.ordinality-1)::integer,
    alt_text=left(coalesce(candidates.value->>'alt_text',''),160),
    description=nullif(left(coalesce(candidates.value->>'description',''),500),''),
    hash=nullif(candidates.value->>'hash',''),mime_type=nullif(candidates.value->>'mime_type',''),
    file_size=nullif(candidates.value->>'file_size','')::bigint,
    width=nullif(candidates.value->>'width','')::integer,
    height=nullif(candidates.value->>'height','')::integer,
    variants=coalesce(candidates.value->'variants','{}'::jsonb),
    upload_status='ready',cleanup_status='active',deleted_at=null,deleted_by=null,updated_at=now()
  from candidates where candidates.id=media.id;

  update public.property_media_cleanup_jobs job
  set status='cancelled',updated_at=now()
  where job.agency_id=p_agency_id and job.property_id=p_property_id
    and job.status in ('pending','processing','retry','failed')
    and exists(select 1 from jsonb_array_elements(p_media) item
      where item->>'storage_path'=job.storage_path);

  with incoming as (
    select value,ordinality from jsonb_array_elements(p_media) with ordinality
  )
  update public.property_photos media
  set public_url=incoming.value->>'url',sort_order=(incoming.ordinality-1)::integer,
    alt_text=left(coalesce(incoming.value->>'alt_text',''),160),
    description=nullif(left(coalesce(incoming.value->>'description',''),500),''),
    hash=coalesce(nullif(incoming.value->>'hash',''),media.hash),
    mime_type=coalesce(nullif(incoming.value->>'mime_type',''),media.mime_type),
    file_size=coalesce(nullif(incoming.value->>'file_size','')::bigint,media.file_size),
    width=coalesce(nullif(incoming.value->>'width','')::integer,media.width),
    height=coalesce(nullif(incoming.value->>'height','')::integer,media.height),
    variants=case when incoming.value?'variants' then incoming.value->'variants' else media.variants end,
    upload_status='ready',cleanup_status='active',updated_at=now()
  from incoming
  where media.agency_id=p_agency_id and media.property_id=p_property_id
    and media.storage_path=incoming.value->>'storage_path' and media.deleted_at is null;

  insert into public.property_photos(
    agency_id,property_id,storage_path,public_url,hash,sort_order,is_cover,
    is_private,is_floorplan,is_360,alt_text,description,mime_type,file_size,width,height,
    variants,upload_status,cleanup_status,uploaded_by
  )
  select p_agency_id,p_property_id,item.value->>'storage_path',item.value->>'url',
    nullif(item.value->>'hash',''),(item.ordinality-1)::integer,false,
    false,false,false,left(coalesce(item.value->>'alt_text',''),160),
    nullif(left(coalesce(item.value->>'description',''),500),''),
    nullif(item.value->>'mime_type',''),nullif(item.value->>'file_size','')::bigint,
    nullif(item.value->>'width','')::integer,nullif(item.value->>'height','')::integer,
    coalesce(item.value->'variants','{}'::jsonb),'ready','active',p_actor_id
  from jsonb_array_elements(p_media) with ordinality item(value,ordinality)
  where not exists(select 1 from public.property_photos media
    where media.property_id=p_property_id and media.storage_path=item.value->>'storage_path'
      and media.deleted_at is null);

  with removed as (
    update public.property_photos media
    set deleted_at=now(),deleted_by=p_actor_id,cleanup_status='pending',is_cover=false,updated_at=now()
    where media.agency_id=p_agency_id and media.property_id=p_property_id and media.deleted_at is null
      and not exists(select 1 from jsonb_array_elements(p_media) item
        where item->>'storage_path'=media.storage_path)
    returning media.id,media.storage_path
  ), queued as (
    insert into public.property_media_cleanup_jobs(
      agency_id,property_id,photo_id,storage_path,reason
    )
    select p_agency_id,p_property_id,removed.id,removed.storage_path,'removed_from_gallery'
    from removed
    on conflict(photo_id) where photo_id is not null do update
      set status='pending',reason=excluded.reason,next_attempt_at=now(),last_error=null,updated_at=now()
    returning 1
  )
  select count(*) into removed_count from queued;

  update public.property_photos set is_cover=false,updated_at=now()
  where agency_id=p_agency_id and property_id=p_property_id and deleted_at is null and is_cover;
  update public.property_photos set is_cover=true,updated_at=now()
  where id=(
    select id from public.property_photos
    where agency_id=p_agency_id and property_id=p_property_id and deleted_at is null
    order by sort_order,created_at,id limit 1
  );

  select coalesce(jsonb_agg(item.value->>'url' order by item.ordinality),'[]'::jsonb)
  into photo_urls from jsonb_array_elements(p_media) with ordinality item(value,ordinality);
  update public.properties
  set attributes=jsonb_set(coalesce(attributes,'{}'::jsonb),'{photos}',photo_urls,true),updated_at=now()
  where id=p_property_id and agency_id=p_agency_id;

  select count(*) into active_count from public.property_photos
  where agency_id=p_agency_id and property_id=p_property_id and deleted_at is null;
  insert into public.property_media_events(agency_id,property_id,actor_id,event_type,details)
  values(p_agency_id,p_property_id,p_actor_id,'gallery_synced',
    jsonb_build_object('active_photos',active_count,'cleanup_jobs',removed_count));
  return jsonb_build_object('active_photos',active_count,'cleanup_jobs',removed_count);
end $$;

create or replace function public.crm_claim_property_media_cleanup(
  p_agency_id uuid,p_limit integer default 10
) returns table(id uuid,property_id uuid,photo_id uuid,storage_path text,attempts integer,max_attempts integer)
language plpgsql security definer set search_path=public,pg_temp as $$
begin
  return query
  with due as (
    select job.id from public.property_media_cleanup_jobs job
    where job.agency_id=p_agency_id
      and ((job.status in ('pending','retry') and job.next_attempt_at<=now())
        or (job.status='processing' and job.started_at<now()-interval '15 minutes'))
      and not exists(select 1 from public.property_photos media
        where media.agency_id=job.agency_id and media.storage_path=job.storage_path
          and media.deleted_at is null)
    order by job.next_attempt_at,job.requested_at
    for update skip locked limit greatest(1,least(coalesce(p_limit,10),50))
  ), claimed as (
    update public.property_media_cleanup_jobs job
    set status='processing',attempts=job.attempts+1,started_at=now(),updated_at=now()
    from due where job.id=due.id returning job.*
  )
  select claimed.id,claimed.property_id,claimed.photo_id,claimed.storage_path,
    claimed.attempts,claimed.max_attempts from claimed;
end $$;

create or replace function public.crm_finish_property_media_cleanup(
  p_agency_id uuid,p_job_id uuid,p_success boolean,p_error text default null,p_retry_at timestamptz default null
) returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare job public.property_media_cleanup_jobs%rowtype; next_status text;
begin
  select * into job from public.property_media_cleanup_jobs
  where id=p_job_id and agency_id=p_agency_id for update;
  if not found then raise exception 'property_media_cleanup_not_found'; end if;
  if p_success then
    next_status:='confirmed';
    update public.property_media_cleanup_jobs
    set status=next_status,confirmed_at=now(),last_error=null,updated_at=now() where id=job.id;
    update public.property_photos set cleanup_status='deleted',updated_at=now()
    where id=job.photo_id and agency_id=p_agency_id and deleted_at is not null;
  else
    next_status:=case when job.attempts>=job.max_attempts then 'failed' else 'retry' end;
    update public.property_media_cleanup_jobs
    set status=next_status,last_error=left(coalesce(p_error,'Eroare necunoscută'),500),
      next_attempt_at=coalesce(p_retry_at,now()+interval '1 hour'),updated_at=now()
    where id=job.id;
    update public.property_photos set cleanup_status=next_status,updated_at=now()
    where id=job.photo_id and agency_id=p_agency_id and deleted_at is not null;
  end if;
  insert into public.property_media_events(agency_id,property_id,event_type,details)
  values(p_agency_id,job.property_id,'cleanup_'||next_status,
    jsonb_build_object('job_id',job.id,'storage_path',job.storage_path,'attempt',job.attempts));
  return next_status;
end $$;

alter table public.property_photos enable row level security;
alter table public.property_media_cleanup_jobs enable row level security;
alter table public.property_media_events enable row level security;
revoke all on public.property_photos from public,anon,authenticated;
revoke all on public.property_media_cleanup_jobs,public.property_media_events from public,anon,authenticated;
grant select on public.property_photos to authenticated;
grant select on public.property_media_cleanup_jobs,public.property_media_events to authenticated;

drop policy if exists crm_property_photos_read on public.property_photos;
create policy crm_property_photos_read on public.property_photos for select to authenticated using(
  agency_id=public.current_crm_agency_id()
  and public.crm_can_access_property(property_id,'view')
);
drop policy if exists crm_property_media_cleanup_read on public.property_media_cleanup_jobs;
create policy crm_property_media_cleanup_read on public.property_media_cleanup_jobs for select to authenticated using(
  agency_id=public.current_crm_agency_id()
  and public.crm_can_access_property(property_id,'edit')
);
drop policy if exists crm_property_media_events_read on public.property_media_events;
create policy crm_property_media_events_read on public.property_media_events for select to authenticated using(
  agency_id=public.current_crm_agency_id()
  and public.crm_can_access_property(property_id,'view')
);

revoke all on function public.crm_property_photo_path(text) from public,anon;
revoke all on function public.crm_sync_property_media(uuid,uuid,uuid,jsonb) from public,anon,authenticated;
revoke all on function public.crm_claim_property_media_cleanup(uuid,integer) from public,anon,authenticated;
revoke all on function public.crm_finish_property_media_cleanup(uuid,uuid,boolean,text,timestamptz)
  from public,anon,authenticated;
grant execute on function public.crm_sync_property_media(uuid,uuid,uuid,jsonb) to service_role;
grant execute on function public.crm_claim_property_media_cleanup(uuid,integer) to service_role;
grant execute on function public.crm_finish_property_media_cleanup(uuid,uuid,boolean,text,timestamptz) to service_role;

commit;
