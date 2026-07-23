begin;

do $$
declare table_name text;
begin
  foreach table_name in array array['leads','tasks','calendar_events','matches','properties','portal_listings','webhook_events','transactions','property_documents'] loop
    if to_regclass('public.'||table_name) is not null then
      execute format('drop trigger if exists crm_notification_event_trigger on public.%I',table_name);
    end if;
  end loop;
end $$;

drop function if exists public.crm_emit_notification_from_change();
drop function if exists public.crm_enqueue_notification(uuid,uuid,text,text,text,text,text,text,text,text,jsonb);
drop table if exists public.notifications;
drop index if exists public.property_documents_expiry_idx;

-- Preserve expiry data if it was entered after deployment. Remove the column
-- only when rollback is lossless.
do $$
begin
  if to_regclass('public.property_documents') is not null
    and not exists(select 1 from public.property_documents where expires_at is not null) then
    alter table public.property_documents drop column if exists expires_at;
  end if;
end $$;

commit;
