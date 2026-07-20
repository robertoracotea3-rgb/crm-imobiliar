begin;

insert into public.feed_tokens(
  id, agency_id, portal, label, token_hash, token_prefix, config, is_active
) values (
  '61000000-0000-4000-8000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'generic',
  'Fixture feed',
  repeat('a', 64),
  'kira_feed_fixture…',
  '{"selection":"site"}'::jsonb,
  true
) on conflict (id) do update set updated_at = now();

insert into public.feed_export_logs(
  id, token_id, agency_id, portal, status, included_count, excluded_count,
  exclusion_summary, duration_ms, completed_at
) values (
  '62000000-0000-4000-8000-000000000001',
  '61000000-0000-4000-8000-000000000001',
  '10000000-0000-0000-0000-000000000001',
  'generic',
  'success',
  1,
  1,
  '{"missing_description":1}'::jsonb,
  12,
  now()
) on conflict (id) do nothing;

insert into public.feed_export_log_items(
  export_log_id, property_id, internal_code, result, reason
) select
  '62000000-0000-4000-8000-000000000001',
  '31000000-0000-0000-0000-000000000001',
  'KIRA-001',
  'included',
  null
where not exists (
  select 1 from public.feed_export_log_items
  where export_log_id = '62000000-0000-4000-8000-000000000001'
    and internal_code = 'KIRA-001'
    and result = 'included'
);

commit;
