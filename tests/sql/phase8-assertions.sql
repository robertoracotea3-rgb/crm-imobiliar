do $$
declare d public.demands%rowtype; p public.properties%rowtype;
begin
  select * into d from public.demands where id = '41000000-0000-0000-0000-000000000001';
  if d.intent <> 'cumparare' or not d.budget_unknown then raise exception 'historical demand was not safely backfilled'; end if;
  if d.property_types <> array['apartament'] or d.city_match_keys <> array['fagaras'] then raise exception 'demand normalization failed'; end if;
  if d.rooms_min <> 2 or d.usable_area_min <> 50 then raise exception 'legacy JSON criteria were not recovered'; end if;
  select * into p from public.properties where id = '51000000-0000-0000-0000-000000000001';
  if p.city_match_key <> 'fagaras' or p.county_match_key <> 'brasov' then raise exception 'property location normalization failed'; end if;
end $$;

do $$
begin
  if (select count(*) from public.demand_match_refresh_queue where agency_id = '10000000-0000-0000-0000-000000000001' and property_id = '51000000-0000-0000-0000-000000000001') <> 0 then
    raise exception 'migration backfill must not create a fake new-property alert';
  end if;
  update public.properties set price = 71000 where id = '51000000-0000-0000-0000-000000000001';
  update public.properties set price = 72000 where id = '51000000-0000-0000-0000-000000000001';
  if (select count(*) from public.demand_match_refresh_queue where status = 'pending' and property_id = '51000000-0000-0000-0000-000000000001') <> 1 then
    raise exception 'property refresh queue is not idempotent';
  end if;
end $$;

insert into public.matches(id, demand_id, property_id, score, details, score_version)
values('61000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000001', 82, '{"reason":"test"}', 'demand-v2');
do $$ begin
  if (select agency_id from public.matches where id = '61000000-0000-0000-0000-000000000001') <> '10000000-0000-0000-0000-000000000001' then
    raise exception 'match agency was not derived';
  end if;
end $$;

do $$
begin
  begin
    insert into public.matches(demand_id, property_id, score)
    values('41000000-0000-0000-0000-000000000001', '52000000-0000-0000-0000-000000000002', 90);
    raise exception 'cross agency match was accepted';
  exception when others then
    if sqlerrm = 'cross agency match was accepted' then raise; end if;
  end;
  begin
    update public.matches set sent_at = now() where id = '61000000-0000-0000-0000-000000000001';
    raise exception 'unconfirmed match was marked sent';
  exception when others then
    if sqlerrm = 'unconfirmed match was marked sent' then raise; end if;
  end;
end $$;

update public.matches set agent_confirmed_at = now(), agent_confirmed_by = 'aaaaaaaa-0000-0000-0000-000000000001'
where id = '61000000-0000-0000-0000-000000000001';
update public.matches set sent_at = now(), sent_via = 'manual_test'
where id = '61000000-0000-0000-0000-000000000001';

insert into public.demands(
  id, agency_id, agent_id, contact_id, internal_code, category, transaction, intent,
  property_types, budget_unknown, cities, counties, criteria
) values (
  '41000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000001',
  'aaaaaaaa-0000-0000-0000-000000000001', '31000000-0000-0000-0000-000000000001',
  'CE-0003', 'teren', 'vanzare', 'oferire_inchiriere', array['teren'], true,
  array[U&'F\0103g\0103ra\0219'], array[U&'Bra\0219ov'], '{}'
);
do $$ begin
  if (select transaction from public.demands where id = '41000000-0000-0000-0000-000000000003') <> 'inchiriere'::public.transaction_type then
    raise exception 'intent-to-enum transaction synchronization failed';
  end if;
end $$;

do $$
begin
  perform set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', true);
  set local role authenticated;
  if (select count(*) from public.matches) <> 1 then raise exception 'RLS did not expose the assigned agency match'; end if;
  reset role;
  perform set_config('request.jwt.claim.sub', 'bbbbbbbb-0000-0000-0000-000000000002', true);
  set local role authenticated;
  if (select count(*) from public.matches) <> 0 then raise exception 'RLS leaked a match across agencies'; end if;
  reset role;
end $$;
