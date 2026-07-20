do $$
begin
  if (select portal_ad_id from public.portal_listings where id = '40000000-0000-4000-8000-000000000001') <> '18196158' then
    raise exception 'portal_ad_id backfill failed';
  end if;

  if not (select relrowsecurity from pg_class where oid = 'public.portal_unmatched_messages'::regclass) then
    raise exception 'RLS is not enabled on portal_unmatched_messages';
  end if;

  begin
    insert into public.properties(id, agency_id, title)
    values (
      '20000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      'Duplicate guard test'
    );
    insert into public.portal_listings(
      id, agency_id, property_id, portal, portal_ad_id
    ) values (
      '40000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002',
      'storia',
      '18196158'
    );
    raise exception 'duplicate portal_ad_id was accepted';
  exception
    when unique_violation then null;
  end;

  begin
    insert into public.leads(id, agency_id, webhook_transaction_id)
    values (
      '80000000-0000-4000-8000-000000000001',
      '10000000-0000-4000-8000-000000000001',
      'phase2-lead-dedup-transaction'
    );
    insert into public.leads(id, agency_id, webhook_transaction_id)
    values (
      '80000000-0000-4000-8000-000000000002',
      '10000000-0000-4000-8000-000000000001',
      'phase2-lead-dedup-transaction'
    );
    raise exception 'duplicate webhook transaction was accepted';
  exception
    when unique_violation then null;
  end;
end $$;

insert into public.webhook_events(
  id, portal, transaction_id, object_id, signature_verified, payload_hash, processing_status
) values (
  '60000000-0000-4000-8000-000000000001',
  'storia',
  'phase2-transaction-001',
  'phase2-object-001',
  true,
  repeat('a', 64),
  'processed'
)
on conflict (id) do nothing;

insert into public.portal_unmatched_messages(
  id, webhook_event_id, agency_id, portal_id, portal, reason
) values (
  '70000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'storia_olx',
  'storia',
  'fixture_unmatched'
)
on conflict (id) do nothing;

select json_build_object(
  'portal_ad_id', (select portal_ad_id from public.portal_listings where id = '40000000-0000-4000-8000-000000000001'),
  'unmatched_rows', (select count(*) from public.portal_unmatched_messages where id = '70000000-0000-4000-8000-000000000001'),
  'rls_enabled', (select relrowsecurity from pg_class where oid = 'public.portal_unmatched_messages'::regclass)
);
