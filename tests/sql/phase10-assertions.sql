do $$
declare rejected boolean;
begin
  if (select source from public.leads where id='51000000-0000-0000-0000-000000000001') <> 'Storia.ro + Olx.ro' then
    raise exception 'historical source was overwritten';
  end if;
  if (select source_normalized from public.leads where id='51000000-0000-0000-0000-000000000001') <> 'storia_olx' then
    raise exception 'combined Storia/OLX source was not normalized';
  end if;
  if (select status from public.leads where id='51000000-0000-0000-0000-000000000002') <> 'contacted' then
    raise exception 'replied lead was not normalized to contacted';
  end if;
  if (select legacy_status from public.leads where id='51000000-0000-0000-0000-000000000002') <> 'replied' then
    raise exception 'historical lead status was not retained';
  end if;
  if (select source_normalized from public.leads where id='51000000-0000-0000-0000-000000000003') <> 'referral' then
    raise exception 'canonical normalized source without raw label was damaged';
  end if;
  if exists (
    select 1 from public.leads l join public.lead_statuses s on s.code=l.status
    where s.requires_next_action and (l.next_action_at is null or l.next_action_type is null)
  ) then raise exception 'active lead without next action'; end if;
  if (select status from public.properties where id='51000000-0000-0000-0000-000000000010') <> 'activa' then
    raise exception 'property status alias failed';
  end if;
  if (select status from public.calendar_events where id='51000000-0000-0000-0000-000000000020') <> 'programata' then
    raise exception 'viewing null status was not normalized';
  end if;
  if (select status from public.transactions where id='51000000-0000-0000-0000-000000000030') <> 'finalizata' then
    raise exception 'historical closed transaction was not finalized';
  end if;
  if (select source_normalized from public.demands where id='51000000-0000-0000-0000-000000000040') <> 'referral' then
    raise exception 'demand source was not normalized';
  end if;
  if not exists (
    select 1 from pg_index i
    where i.indexrelid='public.leads_unmatched_storia_idx'::regclass
      and pg_get_expr(i.indpred, i.indrelid) like '%storia_olx%'
  ) then raise exception 'unmatched Storia index does not cover the combined source'; end if;

  rejected := false;
  begin
    update public.leads set status='won' where id='51000000-0000-0000-0000-000000000001';
  exception when others then rejected := sqlerrm like 'crm_status_transition_invalid:%'; end;
  if not rejected then raise exception 'invalid lead transition was accepted'; end if;

  rejected := false;
  begin
    update public.leads set next_action_at=now() - interval '1 minute'
    where id='51000000-0000-0000-0000-000000000002';
  exception when others then rejected := sqlerrm like 'lead_next_action_must_be_future:%'; end;
  if not rejected then raise exception 'past next action was accepted for active lead'; end if;

  rejected := false;
  begin
    update public.leads set status='lost' where id='51000000-0000-0000-0000-000000000001';
  exception when others then rejected := sqlerrm like 'lead_lost_details_required%'; end;
  if not rejected then raise exception 'lost lead without details was accepted'; end if;

  update public.leads set status='lost', status_reason='Buget insuficient', status_note='Clientul a confirmat motivul'
  where id='51000000-0000-0000-0000-000000000001';

  update public.properties set status='draft' where id='51000000-0000-0000-0000-000000000010';
  rejected := false;
  begin
    update public.properties set status='tranzactionata' where id='51000000-0000-0000-0000-000000000010';
  exception when others then rejected := sqlerrm like 'crm_status_transition_invalid:%'; end;
  if not rejected then raise exception 'invalid property transition was accepted'; end if;

  rejected := false;
  begin
    insert into public.activities(id, agency_id, type) values
      ('51000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000001', 'free_text_type');
  exception when foreign_key_violation then rejected := true; end;
  if not rejected then raise exception 'free activity type was accepted'; end if;
end $$;

select 'phase10 assertions passed' as result;
