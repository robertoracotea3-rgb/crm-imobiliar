import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const container = process.env.KIRA_TEST_DB_CONTAINER || 'kira-crm-sql-test';
const database = 'crmtest_automated';

function docker(args, input) {
  const result = spawnSync('docker', args, {
    cwd: process.cwd(),
    encoding: 'utf8',
    input,
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error([
      `Docker command failed: docker ${args.join(' ')}`,
      result.stdout,
      result.stderr,
    ].filter(Boolean).join('\n'));
  }
  return `${result.stdout || ''}${result.stderr || ''}`;
}

function psql(targetDatabase, sql) {
  return docker([
    'exec', '-i', container,
    'psql', '-v', 'ON_ERROR_STOP=1', '-U', 'postgres', '-d', targetDatabase,
  ], sql);
}

const rolesAndDatabase = `
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;
drop database if exists ${database} with (force);
create database ${database};
`;

try {
  docker(['inspect', container]);
  psql('postgres', rolesAndDatabase);
  psql(database, readFileSync('tests/integration/phase22-base.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260720_040_viewing_workflow.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260720_120_atomic_transactions_outbox.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260720_190_immutable_audit_log.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260723_200_account_security.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260723_210_system_observability.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_220_property_assignments.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_230_storia_lead_property_assignment.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_240_lead_contact_sla.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_250_factual_contact_interactions.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_260_contact_lifecycle.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_270_demand_review_workflow.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_280_property_types_and_dynamic_fields.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_290_agency_email_delivery.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_300_weekly_agent_reports.sql', 'utf8'));
  const phase22 = psql(database, readFileSync('tests/integration/phase22-workflow.sql', 'utf8'));
  const phase23 = psql(database, readFileSync('tests/integration/phase23-audit.sql', 'utf8'));
  const phase25 = psql(database, readFileSync('tests/integration/phase25-account-security.sql', 'utf8'));
  const phase26 = psql(database, readFileSync('tests/integration/phase26-observability.sql', 'utf8'));
  const phase27 = psql(database, readFileSync('tests/integration/phase27-property-assignment.sql', 'utf8'));
  const phase28 = psql(database, readFileSync('tests/integration/phase28-storia-lead-assignment.sql', 'utf8'));
  const phase29 = psql(database, readFileSync('tests/integration/phase29-contact-sla.sql', 'utf8'));
  const phase30 = psql(database, readFileSync('tests/integration/phase30-factual-contact.sql', 'utf8'));
  const phase31 = psql(database, readFileSync('tests/integration/phase31-contact-lifecycle.sql', 'utf8'));
  const phase32 = psql(database, readFileSync('tests/integration/phase32-demand-review.sql', 'utf8'));
  const phase33 = psql(database, readFileSync('tests/integration/phase33-property-types.sql', 'utf8'));
  const phase34 = psql(database, readFileSync('tests/integration/phase34-email-delivery.sql', 'utf8'));
  const phase35 = psql(database, readFileSync('tests/integration/phase35-weekly-reports.sql', 'utf8'));
  psql(database, readFileSync('tests/integration/phase36-prospects-removal-fixture.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260727_340_remove_prospects_module.sql', 'utf8'));
  const phase36 = psql(database, readFileSync('tests/integration/phase36-prospects-removal.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260727_340_remove_prospects_module.sql', 'utf8'));
  const phase36Idempotency = psql(database, readFileSync('tests/integration/phase36-prospects-removal.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260727_350_agent_webmail.sql', 'utf8'));
  const phase37 = psql(database, readFileSync('tests/integration/phase37-agent-webmail.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260727_350_agent_webmail.sql', 'utf8'));
  const phase37Idempotency = psql(database, readFileSync('tests/integration/phase37-agent-webmail.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260720_190_immutable_audit_log.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260723_200_account_security.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260723_210_system_observability.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_220_property_assignments.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_230_storia_lead_property_assignment.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_240_lead_contact_sla.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_250_factual_contact_interactions.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_260_contact_lifecycle.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_270_demand_review_workflow.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_280_property_types_and_dynamic_fields.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_290_agency_email_delivery.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_300_weekly_agent_reports.sql', 'utf8'));
  const idempotency = psql(database, readFileSync('tests/integration/phase23-idempotency.sql', 'utf8'));
  const phase25Idempotency = psql(database, readFileSync('tests/integration/phase25-account-security.sql', 'utf8'));
  const phase26Idempotency = psql(database, readFileSync('tests/integration/phase26-observability.sql', 'utf8'));
  const phase28Idempotency = psql(database, readFileSync('tests/integration/phase28-storia-lead-assignment.sql', 'utf8'));
  const phase29Idempotency = psql(database, readFileSync('tests/integration/phase29-contact-sla.sql', 'utf8'));
  const phase30Idempotency = psql(database, readFileSync('tests/integration/phase30-factual-contact.sql', 'utf8'));
  const phase31Idempotency = psql(database, readFileSync('tests/integration/phase31-contact-lifecycle.sql', 'utf8'));
  const phase32Idempotency = psql(database, readFileSync('tests/integration/phase32-demand-review.sql', 'utf8'));
  const phase33Idempotency = psql(database, readFileSync('tests/integration/phase33-property-types.sql', 'utf8'));
  const phase34Idempotency = psql(database, readFileSync('tests/integration/phase34-email-delivery.sql', 'utf8'));
  const phase35Idempotency = psql(database, readFileSync('tests/integration/phase35-weekly-reports.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260727_350_agent_webmail.rollback.sql', 'utf8'));
  const phase37Rollback = psql(database, readFileSync('tests/integration/phase37-agent-webmail-rollback.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_300_weekly_agent_reports.rollback.sql', 'utf8'));
  const phase35Rollback = psql(database, readFileSync('tests/integration/phase35-weekly-reports-rollback.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_290_agency_email_delivery.rollback.sql', 'utf8'));
  const phase34Rollback = psql(database, readFileSync('tests/integration/phase34-email-delivery-rollback.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_280_property_types_and_dynamic_fields.rollback.sql', 'utf8'));
  const phase33Rollback = psql(database, readFileSync('tests/integration/phase33-property-types-rollback.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_270_demand_review_workflow.rollback.sql', 'utf8'));
  const phase32Rollback = psql(database, readFileSync('tests/integration/phase32-demand-review-rollback.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_260_contact_lifecycle.rollback.sql', 'utf8'));
  const phase31Rollback = psql(database, readFileSync('tests/integration/phase31-contact-lifecycle-rollback.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_250_factual_contact_interactions.rollback.sql', 'utf8'));
  const phase30Rollback = psql(database, readFileSync('tests/integration/phase30-factual-contact-rollback.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_240_lead_contact_sla.rollback.sql', 'utf8'));
  const phase29Rollback = psql(database, readFileSync('tests/integration/phase29-contact-sla-rollback.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_230_storia_lead_property_assignment.rollback.sql', 'utf8'));
  const phase28Rollback = psql(database, readFileSync('tests/integration/phase28-storia-lead-assignment-rollback.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_220_property_assignments.rollback.sql', 'utf8'));
  const phase27Rollback = psql(database, readFileSync('tests/integration/phase27-property-assignment-rollback.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260723_210_system_observability.rollback.sql', 'utf8'));
  const phase26Rollback = psql(database, readFileSync('tests/integration/phase26-observability-rollback.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260723_200_account_security.rollback.sql', 'utf8'));
  const phase25Rollback = psql(database, readFileSync('tests/integration/phase25-account-security-rollback.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260720_190_immutable_audit_log.rollback.sql', 'utf8'));
  const rollback = psql(database, readFileSync('tests/integration/phase23-rollback.sql', 'utf8'));
  if (!phase22.includes('phase22_db_integration_ok')
    || !phase23.includes('phase23_audit_integration_ok')
    || !phase25.includes('phase25_account_security_ok')
    || !phase26.includes('phase26_observability_ok')
    || !phase27.includes('phase27_property_assignment_ok')
    || !phase28.includes('phase28_storia_lead_assignment_ok')
    || !phase29.includes('phase29_contact_sla_ok')
    || !phase30.includes('phase30_factual_contact_ok')
    || !phase31.includes('phase31_contact_lifecycle_ok')
    || !phase32.includes('phase32_demand_review_ok')
    || !phase33.includes('phase33_property_types_ok')
    || !phase34.includes('phase34_email_delivery_ok')
    || !phase35.includes('phase35_weekly_reports_ok')
    || !phase36.includes('phase36_prospects_removal_ok')
    || !phase36Idempotency.includes('phase36_prospects_removal_ok')
    || !phase37.includes('phase37_agent_webmail_ok')
    || !phase37Idempotency.includes('phase37_agent_webmail_ok')
    || !idempotency.includes('phase23_audit_idempotency_ok')
    || !phase25Idempotency.includes('phase25_account_security_ok')
    || !phase26Idempotency.includes('phase26_observability_ok')
    || !phase28Idempotency.includes('phase28_storia_lead_assignment_ok')
    || !phase29Idempotency.includes('phase29_contact_sla_ok')
    || !phase30Idempotency.includes('phase30_factual_contact_ok')
    || !phase31Idempotency.includes('phase31_contact_lifecycle_ok')
    || !phase32Idempotency.includes('phase32_demand_review_ok')
    || !phase33Idempotency.includes('phase33_property_types_ok')
    || !phase34Idempotency.includes('phase34_email_delivery_ok')
    || !phase35Idempotency.includes('phase35_weekly_reports_ok')
    || !phase37Rollback.includes('phase37_agent_webmail_rollback_ok')
    || !phase35Rollback.includes('phase35_weekly_reports_rollback_ok')
    || !phase34Rollback.includes('phase34_email_delivery_rollback_ok')
    || !phase33Rollback.includes('phase33_property_types_rollback_ok')
    || !phase32Rollback.includes('phase32_demand_review_rollback_ok')
    || !phase31Rollback.includes('phase31_contact_lifecycle_rollback_ok')
    || !phase30Rollback.includes('phase30_factual_contact_rollback_ok')
    || !phase29Rollback.includes('phase29_contact_sla_rollback_ok')
    || !phase28Rollback.includes('phase28_storia_lead_assignment_rollback_ok')
    || !phase27Rollback.includes('phase27_property_assignment_rollback_ok')
    || !phase26Rollback.includes('phase26_observability_rollback_ok')
    || !phase25Rollback.includes('phase25_account_security_rollback_ok')
    || !rollback.includes('phase23_audit_rollback_ok')) {
    throw new Error(`Database integration marker is missing.\n${phase22}\n${phase23}\n${phase25}\n${phase26}\n${phase27}\n${phase28}\n${phase29}\n${phase30}\n${phase31}\n${phase32}\n${phase33}\n${phase34}\n${phase35}\n${phase36}\n${phase36Idempotency}\n${phase37}\n${phase37Idempotency}\n${idempotency}\n${phase25Idempotency}\n${phase26Idempotency}\n${phase28Idempotency}\n${phase29Idempotency}\n${phase30Idempotency}\n${phase31Idempotency}\n${phase32Idempotency}\n${phase33Idempotency}\n${phase34Idempotency}\n${phase35Idempotency}\n${phase37Rollback}\n${phase35Rollback}\n${phase34Rollback}\n${phase33Rollback}\n${phase32Rollback}\n${phase31Rollback}\n${phase30Rollback}\n${phase29Rollback}\n${phase28Rollback}\n${phase27Rollback}\n${phase26Rollback}\n${phase25Rollback}\n${rollback}`);
  }
  console.log('Database integration passed: CRM workflow, immutable audit, account security, observability, property assignment, Storia lead assignment, contact SLA, factual contact, contact lifecycle, demand review, property types, email delivery, weekly reports, prospect-module removal, agent webmail and rollbacks.');
} finally {
  if (process.env.KIRA_KEEP_TEST_DB !== '1') {
    try {
      psql('postgres', `drop database if exists ${database} with (force);`);
    } catch (error) {
      console.error(error instanceof Error ? error.message : error);
    }
  }
}
