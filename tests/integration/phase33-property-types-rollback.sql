\set ON_ERROR_STOP on

do $$
begin
  if public.crm_public_property_url(
    '33000000-0000-4000-8000-000000000030',
    'GS-0033',
    'studio_apartment',
    'Fagaras'
  ) <> 'https://www.kiraimobiliare.ro/proprietati/garsoniera-fagaras-gs-0033' then
    raise exception 'Non-destructive rollback removed the studio public URL mapping';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.demands'::regclass
      and conname = 'demands_property_types_check'
  ) then
    raise exception 'Non-destructive rollback removed the demand type guard';
  end if;
end
$$;

select 'phase33_property_types_rollback_ok';
