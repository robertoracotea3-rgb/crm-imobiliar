begin;

create or replace function public.crm_queue_property_matching()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if new.deleted_at is null and new.status = 'activa' and (
    tg_op = 'INSERT'
    or old.status is distinct from new.status
    or old.category is distinct from new.category
    or old.transaction is distinct from new.transaction
    or old.price is distinct from new.price
    or old.currency is distinct from new.currency
    or old.city_match_key is distinct from new.city_match_key
    or old.county_match_key is distinct from new.county_match_key
    or old.zone_match_key is distinct from new.zone_match_key
    or old.attributes is distinct from new.attributes
  ) then
    insert into public.demand_match_refresh_queue(agency_id, property_id)
    values(new.agency_id, new.id)
    on conflict(agency_id, property_id) where status = 'pending'
    do update set created_at = now(), attempts = 0, last_error = null;
  end if;
  return new;
end;
$$;

revoke all on function public.crm_queue_property_matching()
  from public, anon, authenticated;
grant execute on function public.crm_queue_property_matching()
  to service_role;

commit;
