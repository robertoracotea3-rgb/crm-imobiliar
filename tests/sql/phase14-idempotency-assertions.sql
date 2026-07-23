do $$
begin
  if (select count(*) from information_schema.columns
    where table_schema='public' and table_name='portal_tokens'
      and column_name in ('access_token_ciphertext','refresh_token_ciphertext','connection_status'))<>3 then
    raise exception 'idempotent migration changed the token schema';
  end if;
  if (select count(*) from public.portal_tokens)<>2 then
    raise exception 'idempotent migration duplicated or deleted agency tokens';
  end if;
  if (select count(*) from public.portal_token_events)<>4 then
    raise exception 'idempotent migration changed the audit trail';
  end if;
end
$$;
select 'phase14 idempotency assertions passed' as result;
