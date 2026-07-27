import assert from 'node:assert/strict';
import {
  access, mkdtemp, readFile, rm, writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  backupKeyId,
  decodeBackupKey,
  decryptBackupFile,
  encryptBackupFile,
  selectBackupsForRetention,
} from '../lib/backup-format.mjs';

test('backup encryption authenticates content and rejects a wrong key', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'kira-backup-format-'));
  try {
    const input = join(directory, 'input.tar');
    const encrypted = join(directory, 'backup.kira');
    const restored = join(directory, 'restored.tar');
    const key = Buffer.alloc(32, 7);
    await writeFile(input, Buffer.from('synthetic backup payload'));
    const header = await encryptBackupFile(input, encrypted, key, { backup_id: 'test' });
    assert.equal(header.key_id, backupKeyId(key));
    await decryptBackupFile(encrypted, restored, key);
    assert.deepEqual(await readFile(restored), await readFile(input));
    await assert.rejects(
      decryptBackupFile(encrypted, join(directory, 'wrong.tar'), Buffer.alloc(32, 8)),
      /Cheia de backup nu corespunde/,
    );
    const corrupted = join(directory, 'corrupted.kira');
    const partialOutput = join(directory, 'partial.tar');
    const bytes = Buffer.from(await readFile(encrypted));
    bytes[Math.floor(bytes.length / 2)] ^= 0xff;
    await writeFile(corrupted, bytes);
    await assert.rejects(decryptBackupFile(corrupted, partialOutput, key));
    await assert.rejects(access(partialOutput));
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('backup key must contain exactly 32 base64 bytes', () => {
  const value = Buffer.alloc(32, 3).toString('base64');
  assert.deepEqual(decodeBackupKey(value), Buffer.alloc(32, 3));
  assert.throws(() => decodeBackupKey(Buffer.alloc(16).toString('base64')), /exact 32 bytes/);
  assert.throws(() => decodeBackupKey('not-base64'), /exact 32 bytes/);
});

test('retention keeps recent, weekly and monthly recovery points', () => {
  const names = [
    'kira-backup-2026-07-23T00-00-00-000Z.kira',
    'kira-backup-2026-07-22T00-00-00-000Z.kira',
    'kira-backup-2026-07-01T00-00-00-000Z.kira',
    'kira-backup-2026-06-30T00-00-00-000Z.kira',
    'kira-backup-2026-05-01T00-00-00-000Z.kira',
    'kira-backup-2025-01-01T00-00-00-000Z.kira',
    'not-a-backup.txt',
  ];
  const result = selectBackupsForRetention(names, new Date('2026-07-23T12:00:00.000Z'));
  assert.ok(result.keep.includes(names[0]));
  assert.ok(result.keep.includes(names[1]));
  assert.ok(result.keep.includes(names[2]));
  assert.ok(result.keep.includes(names[4]));
  assert.ok(result.remove.includes(names[5]));
  assert.ok(!result.keep.includes('not-a-backup.txt'));
});

test('backup scripts fail closed around plaintext, source restore and storage omissions', async () => {
  const backup = await readFile(new URL('../scripts/backup-supabase-data.mjs', import.meta.url), 'utf8');
  const restore = await readFile(new URL('../scripts/restore-supabase-backup.mjs', import.meta.url), 'utf8');
  assert.match(backup, /skip-storage.*testMode/s);
  assert.match(backup, /decryptBackupFile/);
  assert.match(backup, /rm\(stageDirectory/);
  assert.match(backup, /rename\(partialArchivePath, archivePath\)/);
  assert.match(backup, /join\(tmpdir\(\), `\.kira-stage/);
  assert.match(restore, /confirm-isolated/);
  assert.match(restore, /empty-target/);
  assert.match(restore, /emptyTarget \? \[\] : \['--clean', '--if-exists'\]/);
  assert.match(restore, /\['postgres', 'supabase_admin'\]\.includes\(targetUser\)/);
  assert.match(restore, /'pg_restore', '-U', targetUser/);
  assert.match(restore, /storage\.skipped/);
  assert.match(restore, /Restaurarea peste baza sursă este interzisă/);
  assert.match(restore, /verifyManifest/);
  assert.match(restore, /upsert: false/);
  assert.match(restore, /single-transaction/);
  assert.match(restore, /DATABASE_URL_REDACTED/);
});
