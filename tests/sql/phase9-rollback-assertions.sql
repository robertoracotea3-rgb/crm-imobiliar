do $$
begin
  if to_regclass('public.prospect_source_health') is not null then raise exception 'source health table survived rollback'; end if;
  if to_regclass('public.prospect_sync_runs') is not null then raise exception 'sync runs table survived rollback'; end if;
  if exists(select 1 from information_schema.columns where table_schema='public' and table_name='prospects' and column_name='canonical_url') then raise exception 'phase 9 columns survived rollback'; end if;
  if exists(select 1 from public.prospects where status not in ('nou','contactat','refuzat','mandat')) then raise exception 'legacy statuses not restored'; end if;
  if not exists(select 1 from pg_policies where schemaname='public' and tablename='prospects' and policyname='crm_prospects_select' and qual like '%crm_can_access_row%') then raise exception 'legacy prospect scope policy not restored'; end if;
end $$;
