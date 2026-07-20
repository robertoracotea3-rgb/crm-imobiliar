import test from 'node:test';
import assert from 'node:assert/strict';

import {
  effectivePermissions,
  hasPermission,
  normalizeCrmRole,
  sanitizePermissionMap,
} from '../lib/team-roles.ts';

test('an agent can work only on owned operational rows', () => {
  assert.equal(hasPermission('agent', 'leads', 'view'), true);
  assert.equal(hasPermission('agent', 'leads', 'edit'), true);
  assert.equal(hasPermission('agent', 'leads', 'manage_all'), false);
  assert.equal(hasPermission('agent', 'leads', 'assign'), false);
  assert.equal(hasPermission('agent', 'finance', 'view'), false);
});

test('owner and admin can manage the agency and its permission model', () => {
  assert.equal(hasPermission('owner', 'team', 'manage_permissions'), true);
  assert.equal(hasPermission('admin', 'team', 'manage_permissions'), true);
  assert.equal(hasPermission('admin', 'properties', 'manage_all'), true);
});

test('accountant sees financial data without gaining property access', () => {
  assert.equal(hasPermission('accountant', 'finance', 'view'), true);
  assert.equal(hasPermission('accountant', 'finance', 'view_financial'), true);
  assert.equal(hasPermission('accountant', 'transactions', 'edit'), true);
  assert.equal(hasPermission('accountant', 'properties', 'view'), false);
});

test('viewer cannot write even when it can see an agency-wide module', () => {
  assert.equal(hasPermission('viewer', 'properties', 'view'), true);
  assert.equal(hasPermission('viewer', 'properties', 'manage_all'), true);
  assert.equal(hasPermission('viewer', 'properties', 'create'), false);
  assert.equal(hasPermission('viewer', 'properties', 'edit'), false);
  assert.equal(hasPermission('viewer', 'properties', 'delete'), false);
});

test('unknown roles fail closed as viewer', () => {
  assert.equal(normalizeCrmRole('super_admin'), 'viewer');
  assert.equal(hasPermission('super_admin', 'team', 'manage_permissions'), false);
  assert.equal(hasPermission(null, 'properties', 'edit'), false);
});

test('only recognized modules, actions and boolean overrides are accepted', () => {
  const sanitized = sanitizePermissionMap({
    leads: { view: true, edit: false, delete: 'yes', root: true },
    unknown_module: { view: true },
  });
  assert.deepEqual(sanitized, { leads: { view: true, edit: false } });
});

test('stored profile permissions are the effective source of truth', () => {
  const permissions = effectivePermissions('agent', {
    leads: { edit: false },
    properties: { export: true },
  });
  assert.equal(permissions.leads?.view, true);
  assert.equal(permissions.leads?.edit, false);
  assert.equal(permissions.properties?.export, true);
  assert.equal(permissions.properties?.manage_all, false);
});
