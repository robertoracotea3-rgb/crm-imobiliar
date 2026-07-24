import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('a successful contact requires a complete factual interaction', async () => {
  const [migration, route, dialog] = await Promise.all([
    read('migrations/20260724_250_factual_contact_interactions.sql'),
    read('app/api/leads/contact/route.ts'),
    read('components/RecordContactDialog.tsx'),
  ]);
  assert.match(migration, /lead_contact_interactions/);
  assert.match(migration, /contact_description_required/);
  assert.match(migration, /client_need_required_for_successful_contact/);
  assert.match(migration, /future_next_action_required/);
  assert.match(migration, /successful_contact_interaction_required/);
  assert.match(migration, /unique\(agency_id, idempotency_key\)/);
  assert.match(route, /crm_record_lead_contact/);
  assert.match(route, /lead\.contact_interaction_recorded/);
  for (const label of [
    'Canal folosit',
    'Rezultatul contactării',
    'Descrierea conversației',
    'Ce dorește clientul',
    'Proprietatea discutată',
    'Următoarea acțiune',
  ]) assert.match(dialog, new RegExp(label));
});

test('opening or confirming WhatsApp never becomes a successful contact', async () => {
  const [migration, dialog, updateRoute] = await Promise.all([
    read('migrations/20260724_250_factual_contact_interactions.sql'),
    read('components/ReplyLeadDialog.tsx'),
    read('app/api/leads/update/route.ts'),
  ]);
  assert.match(migration, /'successful_contact', false/);
  assert.match(migration, /message_sent_waiting_reply/);
  assert.match(migration, /răspuns neconfirmat/);
  assert.match(dialog, /doar după ce completezi conversația reală/);
  assert.match(updateRoute, /Înregistrează conversația/);
  assert.doesNotMatch(updateRoute, /patch\.first_response_at\s*=/);
});
