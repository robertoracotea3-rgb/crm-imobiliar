do $$
declare
  result jsonb;
begin
  if (select count(*) from public.lead_pipeline_stages)<>16 then
    raise exception 'pipeline stage catalog is incomplete';
  end if;
  if (select status from public.leads where id='aaaaaaaa-4000-0000-0000-000000000001')<>'new' then
    raise exception 'historical lead status was rewritten';
  end if;
  if (select pipeline_legacy_status from public.leads where id='aaaaaaaa-4000-0000-0000-000000000001')<>'new' then
    raise exception 'historical lead status was not snapshotted';
  end if;
  if (select pipeline_stage from public.leads where id='bbbbbbbb-4000-0000-0000-000000000001')<>'pierdut' then
    raise exception 'historical lost stage mapping failed';
  end if;

  begin
    update public.leads set pipeline_stage='contactat'
    where id='aaaaaaaa-4000-0000-0000-000000000001';
    raise exception 'direct pipeline mutation was accepted';
  exception when others then
    if sqlerrm='direct pipeline mutation was accepted' then raise; end if;
  end;

  begin
    perform public.crm_transition_lead_pipeline(
      'aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',
      'aaaaaaaa-4000-0000-0000-000000000001','contactat',
      now()+interval '1 day','follow_up',null,null
    );
    raise exception 'contact stage accepted without factual contact';
  exception when others then
    if sqlerrm='contact stage accepted without factual contact' then raise; end if;
    if position('Lipsește confirmarea factuală' in sqlerrm)=0 then raise; end if;
  end;

  update public.leads set first_response_at=now()
  where id='aaaaaaaa-4000-0000-0000-000000000001';
  perform public.crm_transition_lead_pipeline(
    'aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',
    'aaaaaaaa-4000-0000-0000-000000000001','contactat',
    now()+interval '1 day','follow_up',null,null
  );
  perform public.crm_transition_lead_pipeline(
    'aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',
    'aaaaaaaa-4000-0000-0000-000000000001','calificat',
    now()+interval '1 day','follow_up',null,null
  );

  begin
    perform public.crm_transition_lead_pipeline(
      'aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',
      'aaaaaaaa-4000-0000-0000-000000000001','cerere_completata',
      now()+interval '1 day','follow_up',null,null
    );
    raise exception 'completed demand stage accepted without demand';
  exception when others then
    if sqlerrm='completed demand stage accepted without demand' then raise; end if;
  end;

  insert into public.demands(agency_id,contact_id,status)
  values('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-2000-0000-0000-000000000001','activa');
  perform public.crm_transition_lead_pipeline(
    'aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',
    'aaaaaaaa-4000-0000-0000-000000000001','cerere_completata',
    now()+interval '1 day','send_offers',null,null
  );

  result:=public.crm_record_lead_property_share(
    'aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',
    'aaaaaaaa-4000-0000-0000-000000000001','aaaaaaaa-3000-0000-0000-000000000001',
    'whatsapp','https://kiraimobiliare.ro/proprietati/a-1','share-a-1'
  );
  perform public.crm_record_lead_property_share(
    'aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',
    'aaaaaaaa-4000-0000-0000-000000000001','aaaaaaaa-3000-0000-0000-000000000001',
    'whatsapp','https://kiraimobiliare.ro/proprietati/a-1','share-a-1'
  );
  if (select count(*) from public.lead_property_shares
      where agency_id='aaaaaaaa-0000-0000-0000-000000000001')<>1 then
    raise exception 'property share idempotency failed';
  end if;
  begin
    perform public.crm_record_lead_property_share(
      'aaaaaaaa-0000-0000-0000-000000000001','bbbbbbbb-1000-0000-0000-000000000001',
      'aaaaaaaa-4000-0000-0000-000000000001','aaaaaaaa-3000-0000-0000-000000000001',
      'email',null,'cross-tenant'
    );
    raise exception 'cross-agency property share was accepted';
  exception when others then
    if sqlerrm='cross-agency property share was accepted' then raise; end if;
  end;
  perform public.crm_transition_lead_pipeline(
    'aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',
    'aaaaaaaa-4000-0000-0000-000000000001','proprietati_trimise',
    now()+interval '1 day','follow_up',null,null
  );

  insert into public.calendar_events(agency_id,lead_id,type,status,start_at)
  values('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-4000-0000-0000-000000000001',
    'vizionare','programata',now()+interval '2 days');
  perform public.crm_transition_lead_pipeline(
    'aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',
    'aaaaaaaa-4000-0000-0000-000000000001','vizionare_programata',
    now()+interval '2 days','viewing',null,null
  );
  update public.calendar_events set status='efectuata',completed_at=now(),outcome='Interesat'
  where lead_id='aaaaaaaa-4000-0000-0000-000000000001';
  perform public.crm_transition_lead_pipeline(
    'aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',
    'aaaaaaaa-4000-0000-0000-000000000001','vizionare_efectuata',
    now()+interval '1 day','follow_up',null,null
  );

  insert into public.transactions(agency_id,lead_id,contact_id,property_id,status,sale_price)
  values('aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-4000-0000-0000-000000000001',
    'aaaaaaaa-2000-0000-0000-000000000001','aaaaaaaa-3000-0000-0000-000000000001','oferta',85000);
  perform public.crm_transition_lead_pipeline(
    'aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',
    'aaaaaaaa-4000-0000-0000-000000000001','oferta',
    now()+interval '1 day','offer',null,null
  );

  begin
    update public.transactions set status='rezervata'
    where lead_id='aaaaaaaa-4000-0000-0000-000000000001';
    raise exception 'reservation without date was accepted';
  exception when others then
    if sqlerrm='reservation without date was accepted' then raise; end if;
  end;
  update public.transactions set status='rezervata',reservation_at=now(),reservation_amount=2000
  where lead_id='aaaaaaaa-4000-0000-0000-000000000001';
  perform public.crm_transition_lead_pipeline(
    'aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',
    'aaaaaaaa-4000-0000-0000-000000000001','rezervare',
    now()+interval '1 day','documents',null,null
  );
  update public.transactions set status='antecontract'
  where lead_id='aaaaaaaa-4000-0000-0000-000000000001';
  perform public.crm_transition_lead_pipeline(
    'aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',
    'aaaaaaaa-4000-0000-0000-000000000001','antecontract',
    now()+interval '1 day','notary',null,null
  );

  begin
    perform public.crm_transition_lead_pipeline(
      'aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',
      'aaaaaaaa-4000-0000-0000-000000000001','finalizat',
      null,null,null,null
    );
    raise exception 'final stage accepted without finalized transaction';
  exception when others then
    if sqlerrm='final stage accepted without finalized transaction' then raise; end if;
  end;
  update public.transactions set status='finalizata'
  where lead_id='aaaaaaaa-4000-0000-0000-000000000001';
  perform public.crm_transition_lead_pipeline(
    'aaaaaaaa-0000-0000-0000-000000000001','aaaaaaaa-1000-0000-0000-000000000001',
    'aaaaaaaa-4000-0000-0000-000000000001','finalizat',
    null,null,null,null
  );

  if (select pipeline_stage from public.leads
      where id='aaaaaaaa-4000-0000-0000-000000000001')<>'finalizat' then
    raise exception 'pipeline did not finish';
  end if;
  if (select status from public.leads
      where id='aaaaaaaa-4000-0000-0000-000000000001')<>'new' then
    raise exception 'pipeline destroyed historical status';
  end if;
  if (select count(*) from public.lead_pipeline_events
      where lead_id='aaaaaaaa-4000-0000-0000-000000000001' and source='manual')<9 then
    raise exception 'pipeline transition history is incomplete';
  end if;
end
$$;

select 'phase18 assertions passed' as result;
