-- Emergency rollback for Phase 16. Verification history is retained when used.

begin;

drop function if exists public.crm_finish_portal_sync_run(
  uuid,uuid,text,integer,integer,integer,integer,integer,integer,text,text
);
drop function if exists public.crm_mark_stale_portal_listings(uuid,text,interval);
drop function if exists public.crm_record_portal_listing_check(
  uuid,uuid,uuid,timestamptz,text,text,boolean,text,text,text,text,text,jsonb,jsonb,integer,uuid
);
drop function if exists public.crm_start_portal_sync_run(uuid,text,text,text);

do $$
begin
  if to_regclass('public.portal_listing_checks') is not null
    and not exists(select 1 from public.portal_listing_checks) then
    drop table public.portal_listing_checks;
  end if;
  if to_regclass('public.portal_sync_health') is not null
    and not exists(select 1 from public.portal_sync_health) then
    drop table public.portal_sync_health;
  end if;
  if to_regclass('public.portal_sync_runs') is not null
    and not exists(select 1 from public.portal_sync_runs) then
    drop table public.portal_sync_runs;
  end if;
end
$$;

commit;
