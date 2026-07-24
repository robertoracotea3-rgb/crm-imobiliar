\set ON_ERROR_STOP on

begin;

insert into auth.users(id,email) values
  ('35000000-0000-4000-8000-000000000001','owner35@example.invalid'),
  ('35000000-0000-4000-8000-000000000002','agent35@example.invalid'),
  ('35000000-0000-4000-8000-000000000003','other35@example.invalid');
insert into public.agencies(id,name) values
  ('35000000-0000-4000-8000-000000000010','Agency 35'),
  ('35000000-0000-4000-8000-000000000011','Other Agency 35');
insert into public.profiles(user_id,agency_id,role,full_name,status) values
  ('35000000-0000-4000-8000-000000000001','35000000-0000-4000-8000-000000000010','owner','Owner 35','active'),
  ('35000000-0000-4000-8000-000000000002','35000000-0000-4000-8000-000000000010','agent','Agent 35','active'),
  ('35000000-0000-4000-8000-000000000003','35000000-0000-4000-8000-000000000011','owner','Other 35','active');

insert into public.leads(
  id,agency_id,contact_name,agent_id,responsible_agent_id,status,
  received_at,assigned_at,first_contact_due_at,contact_sla_status
)
select
  gen_random_uuid(),
  '35000000-0000-4000-8000-000000000010',
  'Lead exact ' || series::text,
  '35000000-0000-4000-8000-000000000002',
  '35000000-0000-4000-8000-000000000002',
  'new',
  '2026-07-21 09:00:00+00'::timestamptz + series * interval '1 minute',
  '2026-07-21 09:00:00+00'::timestamptz + series * interval '1 minute',
  '2026-07-22 09:00:00+00'::timestamptz + series * interval '1 minute',
  'pending'
from generate_series(1, 230) series;

do $$
declare
  v_report_id uuid;
  v_report_id_again uuid;
  metrics jsonb;
  record_count integer;
  claim_count integer;
begin
  v_report_id := public.crm_generate_weekly_report(
    '35000000-0000-4000-8000-000000000010',
    '2026-07-20 00:00:00+00',
    '2026-07-27 00:00:00+00',
    '35000000-0000-4000-8000-000000000001'
  );
  select general_metrics into metrics
  from public.weekly_reports where id = v_report_id;
  if (metrics->>'new_leads')::integer <> 230
     or (metrics->>'uncontacted')::integer <> 230 then
    raise exception 'weekly_report_was_capped_or_inexact: %', metrics;
  end if;
  select count(*) into record_count
  from public.weekly_report_records
  where weekly_report_records.report_id = v_report_id
    and metric_code = 'new_leads';
  if record_count <> 230 then
    raise exception 'weekly_report_drilldown_is_inexact: %', record_count;
  end if;

  v_report_id_again := public.crm_generate_weekly_report(
    '35000000-0000-4000-8000-000000000010',
    '2026-07-20 00:00:00+00',
    '2026-07-27 00:00:00+00',
    '35000000-0000-4000-8000-000000000001'
  );
  if v_report_id_again <> v_report_id
     or (select count(*) from public.weekly_reports
         where agency_id = '35000000-0000-4000-8000-000000000010') <> 1
     or (select generation_version from public.weekly_reports where id = v_report_id) <> 2 then
    raise exception 'weekly_report_duplicate_prevention_failed';
  end if;

  update public.weekly_reports
  set email_status = 'queued', email_next_retry_at = now()
  where id = v_report_id;
  select count(*) into claim_count
  from public.crm_claim_weekly_report_emails(
    now(),
    '35000000-0000-4000-8000-000000000090',
    10
  );
  if claim_count <> 1 then raise exception 'weekly_email_first_claim_failed'; end if;
  select count(*) into claim_count
  from public.crm_claim_weekly_report_emails(
    now(),
    '35000000-0000-4000-8000-000000000091',
    10
  );
  if claim_count <> 0 then raise exception 'weekly_email_duplicate_claim_allowed'; end if;
end
$$;

insert into public.weekly_reports(
  agency_id,period_start,period_end,status,general_metrics,agent_metrics,generated_at
) values (
  '35000000-0000-4000-8000-000000000011',
  '2026-07-20 00:00:00+00',
  '2026-07-27 00:00:00+00',
  'ready',
  '{}',
  '[]',
  now()
);
insert into public.weekly_report_records(
  report_id,agency_id,metric_code,entity_type,entity_id,label
)
select
  report.id,
  report.agency_id,
  'new_leads',
  'lead',
  '35000000-0000-4000-8000-000000000099',
  'Other agency record'
from public.weekly_reports report
where report.agency_id = '35000000-0000-4000-8000-000000000011';

select set_config(
  'request.jwt.claims',
  '{"sub":"35000000-0000-4000-8000-000000000001"}',
  true
);
set local role authenticated;
do $$
begin
  if (select count(*) from public.weekly_reports) <> 1 then
    raise exception 'weekly_reports_cross_tenant_read';
  end if;
  if exists (
    select 1 from public.weekly_report_records
    where agency_id = '35000000-0000-4000-8000-000000000011'
  ) then
    raise exception 'weekly_report_records_cross_tenant_read';
  end if;
end
$$;
reset role;

rollback;

select 'phase35_weekly_reports_ok';
