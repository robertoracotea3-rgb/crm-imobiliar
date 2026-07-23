begin;

drop policy if exists crm_prospect_sync_runs_select on public.prospect_sync_runs;
drop policy if exists crm_prospect_source_health_select on public.prospect_source_health;
drop function if exists public.crm_refresh_prospect_duplicate_groups(uuid);
drop function if exists public.crm_mark_missing_prospects(uuid,text,text[],timestamptz);
drop table if exists public.prospect_sync_runs;
drop table if exists public.prospect_source_health;

drop policy if exists crm_prospects_select on public.prospects;
create policy crm_prospects_select on public.prospects for select to authenticated using (
  agency_id = public.current_crm_agency_id()
  and public.crm_has_permission('prospects','view')
  and public.crm_can_access_row('prospects', array[assigned_to]::uuid[])
);
drop policy if exists crm_prospects_update on public.prospects;
create policy crm_prospects_update on public.prospects for update to authenticated using (
  agency_id = public.current_crm_agency_id()
  and public.crm_has_permission('prospects','edit')
  and public.crm_can_access_row('prospects', array[assigned_to]::uuid[])
) with check (
  agency_id = public.current_crm_agency_id()
  and public.crm_has_permission('prospects','edit')
  and (public.crm_has_permission('prospects','manage_all') or public.crm_has_permission('prospects','assign') or assigned_to = auth.uid())
);

drop trigger if exists crm_sync_prospect_fields_trigger on public.prospects;
drop function if exists public.crm_sync_prospect_fields();
drop function if exists public.crm_prospect_match_key(text);

alter table public.prospects drop constraint if exists prospects_status_check;
update public.prospects set status = case status
  when 'new' then 'nou' when 'active' then 'nou' when 'contacted' then 'contactat'
  when 'interested' then 'contactat' when 'rejected' then 'refuzat'
  when 'imported_to_portfolio' then 'mandat' else 'refuzat' end;
alter table public.prospects alter column status set default 'nou';

drop index if exists public.idx_prospects_server_page;
drop index if exists public.idx_prospects_source_page;
drop index if exists public.idx_prospects_city_page;
drop index if exists public.idx_prospects_category_page;
drop index if exists public.idx_prospects_transaction_page;
drop index if exists public.idx_prospects_canonical_url;
drop index if exists public.idx_prospects_phone_normalized;
drop index if exists public.idx_prospects_duplicate_group;
drop index if exists public.idx_prospects_search_trgm;

alter table public.prospects drop column if exists county;
alter table public.prospects drop column if exists source_normalized;
alter table public.prospects drop column if exists canonical_url;
alter table public.prospects drop column if exists title_normalized;
alter table public.prospects drop column if exists price_normalized;
alter table public.prospects drop column if exists county_normalized;
alter table public.prospects drop column if exists city_normalized;
alter table public.prospects drop column if exists phone_normalized;
alter table public.prospects drop column if exists surface_area;
alter table public.prospects drop column if exists similarity_key;
alter table public.prospects drop column if exists search_text;
alter table public.prospects drop column if exists last_checked_at;
alter table public.prospects drop column if exists sync_error;
alter table public.prospects drop column if exists missing_count;
alter table public.prospects drop column if exists processed_at;
alter table public.prospects drop column if exists status_changed_at;
alter table public.prospects drop column if exists status_before_system;
alter table public.prospects drop column if exists duplicate_group_key;
alter table public.prospects drop column if exists duplicate_confidence;
alter table public.prospects drop column if exists duplicate_reasons;
alter table public.prospects drop column if exists agency_suspected;
alter table public.prospects drop column if exists agency_confidence;
alter table public.prospects drop column if exists agency_reasons;

commit;
