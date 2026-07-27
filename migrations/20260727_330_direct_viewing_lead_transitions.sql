-- A lead can arrive with a viewing already agreed (for example, a portal
-- inquiry followed by an immediate phone confirmation). The viewing workflow
-- moves such an open lead directly to upcoming_viewing.

begin;

insert into public.crm_status_transitions(
  entity_type,
  from_code,
  to_code,
  is_active
) values
  ('lead', 'new', 'upcoming_viewing', true),
  ('lead', 'no_answer', 'upcoming_viewing', true)
on conflict(entity_type, from_code, to_code)
do update set is_active = true;

commit;
