import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  NOTIFICATION_PRIORITIES,
  normalizeNotificationActionUrl,
  notificationDedupKey,
} from '../lib/notifications.ts';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('notification priorities and deduplication keys are canonical', () => {
  assert.deepEqual(NOTIFICATION_PRIORITIES, ['low', 'normal', 'high', 'urgent']);
  assert.equal(notificationDedupKey(' new_lead ', ' abc '), 'new_lead:abc');
});

test('notification links accept only internal CRM paths', () => {
  assert.equal(normalizeNotificationActionUrl('/clients/abc'), '/clients/abc');
  assert.equal(normalizeNotificationActionUrl('  /properties/one  '), '/properties/one');
  assert.equal(normalizeNotificationActionUrl('https://evil.example'), null);
  assert.equal(normalizeNotificationActionUrl('//evil.example/path'), null);
  assert.equal(normalizeNotificationActionUrl('javascript:alert(1)'), null);
});

test('inbox is persistent, paginated and never uses browser-local read state', async () => {
  const [route, page, sidebar] = await Promise.all([
    read('app/api/notifications/route.ts'),
    read('app/notifications/page.tsx'),
    read('components/Sidebar.tsx'),
  ]);
  assert.match(route, /PAGE_SIZE_MAX = 50/);
  assert.match(route, /\.range\(from, from \+ pageSize - 1\)/);
  assert.match(route, /action === 'read_all'/);
  assert.match(route, /dismissed_at/);
  assert.match(page, /crm:notifications-changed/);
  assert.doesNotMatch(`${page}\n${sidebar}`, /notif_last_seen|localStorage/);
});

test('dashboard and inbox use the same notifications table', async () => {
  const route = await read('app/api/dashboard/overview/route.ts');
  assert.match(route, /\.from\('notifications'\)/);
  assert.match(route, /syncTimeBasedNotifications/);
  assert.doesNotMatch(route, /new_client_agent_|no_photos_batch|demand_match_\$\{/);
});

test('migration defines tenant-isolated persistence and every required event', async () => {
  const migration = await read('migrations/20260720_110_persistent_notifications.sql');
  for (const field of [
    'agency_id', 'user_id', 'type', 'title', 'message', 'entity_type', 'entity_id',
    'priority', 'read_at', 'dismissed_at', 'created_at',
  ]) assert.match(migration, new RegExp(`\\b${field}\\b`));
  for (const type of [
    'new_lead', 'lead_uncontacted', 'viewing_reminder', 'task_overdue', 'demand_match',
    'property_expired', 'portal_error', 'webhook_rejected', 'transaction', 'document_expired',
  ]) assert.match(migration, new RegExp(`'${type}'`));
  assert.match(migration, /unique\(agency_id, user_id, dedup_key\)/);
  assert.match(migration, /user_id=auth\.uid\(\)/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /grant update\(read_at,dismissed_at,updated_at\)/);
  assert.doesNotMatch(migration, /grant select,update on public\.notifications/);
});
