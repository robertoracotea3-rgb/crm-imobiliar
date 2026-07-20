-- Agent A sees only its row and cannot update/assign Agent B's row.
set role authenticated;
select set_config('request.jwt.claim.sub', 'aaaaaaaa-0000-0000-0000-000000000001', false);
do $$
declare
  visible_count integer;
  changed_count integer;
  denied boolean := false;
begin
  select count(*) into visible_count from public.properties;
  if visible_count <> 1 then raise exception 'agent row scope failed: % visible', visible_count; end if;

  update public.properties set title = 'forbidden' where id = '31000000-0000-0000-0000-000000000002';
  get diagnostics changed_count = row_count;
  if changed_count <> 0 then raise exception 'agent modified another agent row'; end if;

  begin
    insert into public.properties(id, agency_id, agent_id, title) values (
      '31000000-0000-0000-0000-000000000009',
      '10000000-0000-0000-0000-000000000001',
      'bbbbbbbb-0000-0000-0000-000000000002',
      'invalid assignment'
    );
  exception when insufficient_privilege then denied := true;
  end;
  if not denied then raise exception 'agent assigned a row to another agent'; end if;
end $$;
reset role;

-- Manager can see and edit the whole agency, never another agency.
set role authenticated;
select set_config('request.jwt.claim.sub', 'cccccccc-0000-0000-0000-000000000003', false);
do $$
declare
  visible_count integer;
  changed_count integer;
begin
  select count(*) into visible_count from public.properties;
  if visible_count <> 2 then raise exception 'manager agency scope failed: % visible', visible_count; end if;
  update public.properties set title = 'manager edit' where id = '31000000-0000-0000-0000-000000000002';
  get diagnostics changed_count = row_count;
  if changed_count <> 1 then raise exception 'manager could not edit agency row'; end if;
end $$;
reset role;

-- Viewer has agency-wide read access but no write access.
set role authenticated;
select set_config('request.jwt.claim.sub', 'dddddddd-0000-0000-0000-000000000004', false);
do $$
declare
  visible_count integer;
  changed_count integer;
begin
  select count(*) into visible_count from public.properties;
  if visible_count <> 2 then raise exception 'viewer read scope failed: % visible', visible_count; end if;
  update public.properties set title = 'viewer edit' where id = '31000000-0000-0000-0000-000000000001';
  get diagnostics changed_count = row_count;
  if changed_count <> 0 then raise exception 'viewer obtained write access'; end if;
end $$;
reset role;

-- Accountant sees financial rows, not properties, and remains agency scoped.
set role authenticated;
select set_config('request.jwt.claim.sub', 'eeeeeeee-0000-0000-0000-000000000005', false);
do $$
declare
  property_count integer;
  transaction_count integer;
  changed_count integer;
begin
  select count(*) into property_count from public.properties;
  select count(*) into transaction_count from public.transactions;
  if property_count <> 0 then raise exception 'accountant can see properties'; end if;
  if transaction_count <> 2 then raise exception 'accountant transaction scope failed: %', transaction_count; end if;
  update public.transactions set sale_price = 210000 where id = '41000000-0000-0000-0000-000000000002';
  get diagnostics changed_count = row_count;
  if changed_count <> 1 then raise exception 'accountant could not edit agency transaction'; end if;
end $$;
reset role;

-- A user from Agency B cannot read any Agency A row.
set role authenticated;
select set_config('request.jwt.claim.sub', 'ffffffff-0000-0000-0000-000000000006', false);
do $$
declare
  foreign_count integer;
begin
  select count(*) into foreign_count
  from public.properties
  where agency_id = '10000000-0000-0000-0000-000000000001';
  if foreign_count <> 0 then raise exception 'cross-agency property access detected'; end if;
end $$;
reset role;

select
  (select count(*) from public.crm_role_permissions) as permission_rows,
  (select count(*) from public.properties) as historical_properties_preserved,
  (select count(*) from public.transactions) as historical_transactions_preserved;
