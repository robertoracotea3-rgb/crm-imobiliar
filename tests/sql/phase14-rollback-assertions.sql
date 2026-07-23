do $$
begin
  if to_regprocedure('public.crm_consume_portal_oauth_session(text,text)') is not null then
    raise exception 'OAuth consume function survived rollback';
  end if;
  if to_regprocedure('public.crm_revoke_portal_connection(uuid,text,uuid,text)') is not null then
    raise exception 'portal revocation function survived rollback';
  end if;
  if (select count(*) from public.portal_tokens)<>2 then
    raise exception 'rollback deleted portal credentials';
  end if;
  if exists(select 1 from public.portal_tokens
    where agency_id='bbbbbbbb-0000-0000-0000-000000000001'
      and access_token_ciphertext is null) then
    raise exception 'rollback destroyed encrypted credentials';
  end if;
  if to_regclass('public.portal_token_events') is null
    or (select count(*) from public.portal_token_events)<>4 then
    raise exception 'rollback destroyed the OAuth audit trail';
  end if;
end
$$;
select 'phase14 rollback assertions passed' as result;
