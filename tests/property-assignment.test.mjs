import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assignmentImpactSummary,
  normalizePropertyAssignmentRequest,
} from '../lib/property-assignment.ts';

const propertyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const agentId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

test('normalizes a confirmed assignment and its cascade choices', () => {
  const result = normalizePropertyAssignmentRequest({
    property_ids: [propertyId, propertyId],
    responsible_agent_id: agentId,
    reason: '  Zona Făgăraș  ',
    options: {
      reassign_active_leads: true,
      reassign_future_viewings: true,
    },
  });
  assert.deepEqual(result.errors, []);
  assert.ok(result.value);
  assert.deepEqual(result.value?.propertyIds, [propertyId]);
  assert.equal(result.value?.reason, 'Zona Făgăraș');
  assert.deepEqual(assignmentImpactSummary(result.value.options), [
    'leadurile active',
    'vizionările viitoare',
  ]);
});

test('an unassigned active property requires an explicit documented exception', () => {
  const missingApproval = normalizePropertyAssignmentRequest({
    property_ids: [propertyId],
    responsible_agent_id: null,
    reason: 'Agentul va fi stabilit mâine',
  });
  assert.match(missingApproval.errors.join(' '), /excepție explicită/);

  const missingReason = normalizePropertyAssignmentRequest({
    property_ids: [propertyId],
    responsible_agent_id: null,
    options: { allow_unassigned_exception: true },
  });
  assert.match(missingReason.errors.join(' '), /Motivul este obligatoriu/);
});

test('rejects cross-shape identifiers before calling the database', () => {
  const result = normalizePropertyAssignmentRequest({
    property_ids: ['not-a-property'],
    responsible_agent_id: 'not-an-agent',
    options: {},
  });
  assert.equal(result.value, null);
  assert.match(result.errors.join(' '), /ID invalid/);
  assert.match(result.errors.join(' '), /Agentul selectat este invalid/);
});
