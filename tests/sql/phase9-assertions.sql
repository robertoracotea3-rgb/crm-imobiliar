do $$
declare value integer;
begin
  if (select status from public.prospects where external_id = 'one') <> 'active' then raise exception 'recent legacy row not active'; end if;
  if (select status from public.prospects where external_id = 'old') <> 'stale' then raise exception 'old legacy row not stale'; end if;
  if (select count(*) from public.prospect_source_health) <> 4 then raise exception 'source health seeds missing'; end if;
  if not exists(select 1 from pg_indexes where indexname = 'idx_prospects_server_page') then raise exception 'pagination index missing'; end if;

  select public.crm_refresh_prospect_duplicate_groups('10000000-0000-0000-0000-000000000001') into value;
  if value <> 2 then raise exception 'duplicate group members expected 2, got %', value; end if;
  if (select count(*) from public.prospects where agency_id='10000000-0000-0000-0000-000000000001') <> 3 then raise exception 'dedup deleted rows'; end if;
  if (select count(distinct duplicate_group_key) from public.prospects where external_id in ('one','two')) <> 1 then raise exception 'duplicates not grouped'; end if;

  select public.crm_mark_missing_prospects('10000000-0000-0000-0000-000000000001','olx',array['one'],now()) into value;
  if value <> 1 then raise exception 'first missing pass failed'; end if;
  select public.crm_mark_missing_prospects('10000000-0000-0000-0000-000000000001','olx',array['one'],now()) into value;
  if (select status from public.prospects where external_id='old') <> 'removed' then raise exception 'missing row not removed after two complete runs'; end if;
end $$;

alter table public.prospects enable row level security;
grant select on public.prospects to authenticated;
set role authenticated;
select set_config('request.jwt.claim.sub','aaaaaaaa-0000-0000-0000-000000000001',false);
do $$ begin
  if (select count(*) from public.prospects) <> 3 then raise exception 'tenant or shared pool RLS failed'; end if;
end $$;
reset role;
