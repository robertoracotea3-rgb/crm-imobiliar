begin;

delete from public.crm_status_transitions
where entity_type = 'lead'
  and to_code = 'upcoming_viewing'
  and from_code in ('new', 'no_answer');

commit;
