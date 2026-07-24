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
  const phase22 = psql(database, readFileSync('tests/integration/phase22-workflow.sql', 'utf8'));
  const phase23 = psql(database, readFileSync('tests/integration/phase23-audit.sql', 'utf8'));
  const phase25 = psql(database, readFileSync('tests/integration/phase25-account-security.sql', 'utf8'));
  const phase26 = psql(database, readFileSync('tests/integration/phase26-observability.sql', 'utf8'));
  const phase27 = psql(database, readFileSync('tests/integration/phase27-property-assignment.sql', 'utf8'));
  const phase28 = psql(database, readFileSync('tests/integration/phase28-storia-lead-assignment.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260720_190_immutable_audit_log.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260723_200_account_security.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260723_210_system_observability.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_220_property_assignments.sql', 'utf8'));
  psql(database, readFileSync('migrations/20260724_230_storia_lead_property_assignment.sql', 'utf8'));
  const idempotency = psql(database, readFileSync('tests/integration/phase23-idempotency.sql', 'utf8'));
  const phase25Idempotency = psql(database, readFileSync('tests/integration/phase25-account-security.sql', 'utf8'));
  const phase26Idempotency = psql(database, readFileSync('tests/integration/phase26-observability.sql', 'utf8'));
  const phase28Idempotency = psql(database, readFileSync('tests/integration/phase28-storia-lead-assignment.sql', 'utf8'));
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
    || !idempotency.includes('phase23_audit_idempotency_ok')
    || !phase25Idempotency.includes('phase25_account_security_ok')
    || !phase26Idempotency.includes('phase26_observability_ok')
    || !phase28Idempotency.includes('phase28_storia_lead_assignment_ok')
    || !phase28Rollback.includes('phase28_storia_lead_assignment_rollback_ok')
    || !phase27Rollback.includes('phase27_property_assignment_rollback_ok')
    || !phase26Rollback.includes('phase26_observability_rollback_ok')
    || !phase25Rollback.includes('phase25_account_security_rollback_ok')
    || !rollback.includes('phase23_audit_rollback_ok')) {
    throw new Error(`Database integration marker is missing.\n${phase22}\n${phase23}\n${phase25}\n${phase26}\n${phase27}\n${phase28}\n${idempotency}\n${phase25Idempotency}\n${phase26Idempotency}\n${phase28Idempotency}\n${phase28Rollback}\n${phase27Rollback}\n${phase26Rollback}\n${phase25Rollback}\n${rollback}`);
  }
  console.log('Database integration passed: CRM workflow, immutable audit, account security, observability, property assignment, Storia lead assignment and rollbacks.');
} finally {
  try {
    psql('postgres', `drop database if exists ${database} with (force);`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
  }
}
