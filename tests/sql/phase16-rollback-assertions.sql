do $$
begin
  if to_regprocedure('public.crm_record_portal_listing_check(uuid,uuid,uuid,timestamptz,text,text,boolean,text,text,text,text,text,jsonb,jsonb,integer,uuid)') is not null then
    raise exception 'listing check function survived rollback';
  end if;
  if to_regprocedure('public.crm_start_portal_sync_run(uuid,text,text,text)') is not null then
    raise exception 'sync start function survived rollback';
  end if;
  if (select count(*) from public.portal_listings)<>2 then
    raise exception 'rollback deleted portal listings';
  end if;
  if to_regclass('public.portal_listing_checks') is null
    or (select count(*) from public.portal_listing_checks)<>4 then
    raise exception 'rollback deleted listing verification history';
  end if;
  if to_regclass('public.portal_sync_runs') is null
    or (select count(*) from public.portal_sync_runs)<>2 then
    raise exception 'rollback deleted sync run history';
  end if;
end
$$;
select 'phase16 rollback assertions passed' as result;
