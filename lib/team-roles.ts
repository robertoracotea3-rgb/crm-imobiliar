export const CRM_ROLES = [
  'owner',
  'admin',
  'manager',
  'agent_senior',
  'agent',
  'assistant',
  'accountant',
  'viewer',
] as const;

export type CrmRole = (typeof CRM_ROLES)[number];

export const CRM_ACTIONS = [
  'view',
  'create',
  'edit',
  'delete',
  'assign',
  'export',
  'manage_all',
  'view_financial',
  'manage_permissions',
] as const;

export type CrmAction = (typeof CRM_ACTIONS)[number];

export const CRM_MODULES = [
  'dashboard',
  'properties',
  'contacts',
  'leads',
  'demands',
  'viewings',
  'calendar',
  'tasks',
  'prospects',
  'notifications',
  'transactions',
  'finance',
  'portals',
  'feed',
  'team',
  'settings',
  'reports',
] as const;

export type CrmModule = (typeof CRM_MODULES)[number];
export type ModulePermission = Partial<Record<CrmAction, boolean>>;
export type PermissionMap = Partial<Record<CrmModule, ModulePermission>>;

export const ROLES: Record<string, string> = {
  owner: 'Proprietar',
  admin: 'Administrator',
  manager: 'Manager',
  agent_senior: 'Agent Senior',
  agent: 'Agent',
  assistant: 'Asistent',
  accountant: 'Contabil',
  viewer: 'Doar vizualizare',
};

export const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-800',
  admin: 'bg-red-100 text-red-800',
  manager: 'bg-blue-100 text-blue-800',
  agent_senior: 'bg-emerald-100 text-emerald-800',
  agent: 'bg-gray-100 text-gray-700',
  assistant: 'bg-yellow-100 text-yellow-800',
  accountant: 'bg-cyan-100 text-cyan-800',
  viewer: 'bg-slate-100 text-slate-700',
};

export const MODULES: { key: CrmModule; label: string }[] = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'properties', label: 'Proprietăți' },
  { key: 'contacts', label: 'Contacte' },
  { key: 'leads', label: 'Clienți și leaduri' },
  { key: 'demands', label: 'Cereri' },
  { key: 'viewings', label: 'Vizionări' },
  { key: 'calendar', label: 'Calendar' },
  { key: 'tasks', label: 'Taskuri' },
  { key: 'prospects', label: 'Particulari' },
  { key: 'notifications', label: 'Notificări' },
  { key: 'transactions', label: 'Tranzacții' },
  { key: 'finance', label: 'Finanțe' },
  { key: 'portals', label: 'Portaluri' },
  { key: 'feed', label: 'Feeduri' },
  { key: 'team', label: 'Echipă' },
  { key: 'settings', label: 'Setări' },
  { key: 'reports', label: 'Rapoarte' },
];

export const ACTIONS: CrmAction[] = [...CRM_ACTIONS];

const readOnly = (manageAll = false): ModulePermission => ({
  view: true,
  create: false,
  edit: false,
  delete: false,
  assign: false,
  export: false,
  manage_all: manageAll,
  view_financial: false,
  manage_permissions: false,
});

const ownCrud = (extra: ModulePermission = {}): ModulePermission => ({
  view: true,
  create: true,
  edit: true,
  delete: false,
  assign: false,
  export: false,
  manage_all: false,
  view_financial: false,
  manage_permissions: false,
  ...extra,
});

const agencyCrud = (extra: ModulePermission = {}): ModulePermission => ({
  view: true,
  create: true,
  edit: true,
  delete: true,
  assign: true,
  export: true,
  manage_all: true,
  view_financial: false,
  manage_permissions: false,
  ...extra,
});

const ownerPermissions = Object.fromEntries(
  CRM_MODULES.map(module => [module, agencyCrud({ view_financial: true, manage_permissions: true })]),
) as PermissionMap;

export const DEFAULT_PERMISSIONS: Record<string, PermissionMap> = {
  owner: ownerPermissions,
  admin: Object.fromEntries(
    CRM_MODULES.map(module => [module, agencyCrud({
      view_financial: ['dashboard', 'transactions', 'finance', 'reports'].includes(module),
      manage_permissions: module === 'team',
    })]),
  ) as PermissionMap,
  manager: {
    dashboard: readOnly(true),
    properties: agencyCrud({ delete: false }),
    contacts: agencyCrud({ delete: false }),
    leads: agencyCrud({ delete: false }),
    demands: agencyCrud({ delete: false }),
    viewings: agencyCrud({ delete: false }),
    calendar: agencyCrud({ delete: false }),
    tasks: agencyCrud({ delete: false }),
    prospects: agencyCrud({ delete: false }),
    notifications: agencyCrud({ delete: false, export: false }),
    transactions: agencyCrud({ delete: false, view_financial: true }),
    finance: { ...readOnly(true), view_financial: true, export: true },
    portals: agencyCrud({ delete: false }),
    feed: agencyCrud({ delete: false }),
    team: { ...readOnly(true), edit: true, assign: true },
    settings: readOnly(true),
    reports: { ...readOnly(true), export: true, view_financial: true },
  },
  agent_senior: {
    dashboard: readOnly(), properties: ownCrud({ export: true }), contacts: ownCrud(),
    leads: ownCrud(), demands: ownCrud(), viewings: ownCrud(), calendar: ownCrud(),
    tasks: ownCrud(), prospects: ownCrud(), notifications: ownCrud(),
    transactions: ownCrud({ view_financial: true }), reports: readOnly(),
  },
  agent: {
    dashboard: readOnly(), properties: ownCrud(), contacts: ownCrud(), leads: ownCrud(),
    demands: ownCrud(), viewings: ownCrud(), calendar: ownCrud(), tasks: ownCrud(),
    prospects: ownCrud(), notifications: ownCrud(), transactions: ownCrud({ view_financial: true }),
    reports: readOnly(),
  },
  assistant: {
    dashboard: readOnly(), properties: readOnly(), contacts: ownCrud(), leads: readOnly(),
    demands: ownCrud({ edit: false }), viewings: ownCrud(), calendar: ownCrud(),
    tasks: ownCrud(), notifications: ownCrud(),
  },
  accountant: {
    dashboard: readOnly(true),
    transactions: { ...readOnly(true), edit: true, export: true, view_financial: true },
    finance: { ...readOnly(true), export: true, view_financial: true },
    reports: { ...readOnly(true), export: true, view_financial: true },
    notifications: ownCrud(),
  },
  viewer: {
    dashboard: readOnly(true),
    properties: readOnly(true),
    reports: readOnly(true),
  },
};

export function normalizeCrmRole(value: unknown): CrmRole {
  return typeof value === 'string' && (CRM_ROLES as readonly string[]).includes(value)
    ? value as CrmRole
    : 'viewer';
}

export function sanitizePermissionMap(value: unknown): PermissionMap | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  const result: PermissionMap = {};

  for (const moduleKey of CRM_MODULES) {
    const moduleValue = input[moduleKey];
    if (!moduleValue || typeof moduleValue !== 'object' || Array.isArray(moduleValue)) continue;
    const actions = moduleValue as Record<string, unknown>;
    const clean: ModulePermission = {};
    for (const action of CRM_ACTIONS) {
      if (typeof actions[action] === 'boolean') clean[action] = actions[action] as boolean;
    }
    if (Object.keys(clean).length) result[moduleKey] = clean;
  }

  return Object.keys(result).length ? result : null;
}

export function effectivePermissions(roleValue: unknown, customValue?: unknown): PermissionMap {
  const role = normalizeCrmRole(roleValue);
  const defaults = DEFAULT_PERMISSIONS[role];
  const custom = sanitizePermissionMap(customValue);
  if (!custom) return defaults;

  const merged: PermissionMap = {};
  for (const moduleKey of CRM_MODULES) {
    merged[moduleKey] = { ...(defaults[moduleKey] || {}), ...(custom[moduleKey] || {}) };
  }
  return merged;
}

export function hasPermission(
  roleValue: unknown,
  module: CrmModule,
  action: CrmAction,
  customValue?: unknown,
): boolean {
  return effectivePermissions(roleValue, customValue)[module]?.[action] === true;
}
