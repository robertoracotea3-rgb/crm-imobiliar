do $$
begin
  if not (select relrowsecurity from pg_class where oid = 'public.feed_tokens'::regclass) then
    raise exception 'RLS is not enabled on feed_tokens';
  end if;
  if has_table_privilege('authenticated', 'public.feed_tokens', 'select') then
    raise exception 'Authenticated sessions can read feed token hashes';
  end if;
  if exists (
    select 1 from public.feed_tokens
    where token_hash like 'kira_feed_%' or token_hash !~ '^[a-f0-9]{64}$'
  ) then
    raise exception 'A feed token is stored in clear text or an invalid hash';
  end if;
  if (select count(*) from public.feed_export_logs where id = '62000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'Export log fixture missing';
  end if;
  if (select count(*) from public.feed_export_log_items where export_log_id = '62000000-0000-4000-8000-000000000001') <> 1 then
    raise exception 'Export log detail fixture missing';
  end if;
end $$;

select jsonb_build_object(
  'tokens', (select count(*) from public.feed_tokens),
  'logs', (select count(*) from public.feed_export_logs),
  'items', (select count(*) from public.feed_export_log_items),
  'rls_enabled', (select relrowsecurity from pg_class where oid = 'public.feed_tokens'::regclass)
) as phase6_result;
