import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('disaster recovery runbook defines measurable ownership and recovery targets', async () => {
  const runbook = await readFile(
    new URL('../docs/backup-disaster-recovery.md', import.meta.url),
    'utf8',
  );
  assert.match(runbook, /RPO: maximum 6 ore/);
  assert.match(runbook, /RTO: maximum 4 ore/);
  assert.match(runbook, /la fiecare 6 ore/);
  assert.match(runbook, /ultimele 14 zile/);
  assert.match(runbook, /până la 90 de zile/);
  assert.match(runbook, /până la 365 de zile/);
  assert.match(runbook, /Responsabilitate/);
  assert.match(runbook, /testul lunar de restaurare/i);
  assert.match(runbook, /Nu restaura direct peste producție/);
});

test('scheduled backup wrappers keep secrets out of task arguments', async () => {
  const registerTask = await readFile(
    new URL('../ops/register-backup-task.ps1', import.meta.url),
    'utf8',
  );
  const runner = await readFile(new URL('../ops/run-backup.ps1', import.meta.url), 'utf8');
  assert.doesNotMatch(registerTask, /BACKUP_ENCRYPTION_KEY|SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(runner, /BACKUP_ENCRYPTION_KEY\s*=/);
  assert.match(registerTask, /RepetitionInterval/);
  assert.match(runner, /backup:create/);
});
