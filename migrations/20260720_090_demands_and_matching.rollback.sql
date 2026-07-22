begin;

drop trigger if exists crm_queue_property_matching_trigger on public.properties;
drop trigger if exists crm_validate_match_write_trigger on public.matches;
drop trigger if exists crm_sync_property_match_fields_trigger on public.properties;
drop trigger if exists crm_sync_demand_match_fields_trigger on public.demands;

drop function if exists public.crm_queue_property_matching();
drop function if exists public.crm_validate_match_write();
drop function if exists public.crm_sync_property_match_fields();
drop function if exists public.crm_sync_demand_match_fields();
drop function if exists public.crm_match_key_array(text[]);
drop function if exists public.crm_match_key(text);

drop policy if exists crm_matches_select on public.matches;

-- Business history, calculated matches and the new demand fields are retained.
-- Pending refresh work is disabled instead of being deleted.
update public.demand_match_refresh_queue
set status = 'rollback_disabled', processed_at = coalesce(processed_at, now())
where status = 'pending';

commit;
