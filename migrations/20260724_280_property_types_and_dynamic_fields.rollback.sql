-- Non-destructive rollback for extension 7/8.
--
-- PostgreSQL enum values cannot be removed safely while properties, demands,
-- feeds or historical audit records may reference them. The stable
-- studio_apartment value and the expanded demand constraint are therefore
-- intentionally retained. Rolling back the application commit restores the
-- previous UI without deleting or rewriting any property data.

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.demands'::regclass
      and conname = 'demands_property_types_check'
  ) then
    raise exception 'Safe rollback refused: demands_property_types_check is missing';
  end if;
end
$$;
