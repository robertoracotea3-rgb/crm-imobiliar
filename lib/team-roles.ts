export const ROLES: Record<string, string> = {
  owner: 'Proprietar',
  admin: 'Administrator',
  manager: 'Manager',
  agent_senior: 'Agent Senior',
  agent: 'Agent',
  assistant: 'Asistent',
};

export const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-800',
  admin: 'bg-red-100 text-red-800',
  manager: 'bg-blue-100 text-blue-800',
  agent_senior: 'bg-emerald-100 text-emerald-800',
  agent: 'bg-gray-100 text-gray-700',
  assistant: 'bg-yellow-100 text-yellow-800',
};

export const MODULES = [
  { key: 'dashboard', label: 'Dashboard' },
  { key: 'properties', label: 'Proprietăți' },
  { key: 'contacts', label: 'Contacte' },
  { key: 'demands', label: 'Cereri' },
  { key: 'leads', label: 'Lead-uri' },
  { key: 'portals', label: 'Portaluri' },
  { key: 'team', label: 'Echipă' },
  { key: 'settings', label: 'Setări' },
  { key: 'reports', label: 'Rapoarte' },
];

export const ACTIONS = ['view', 'create', 'edit', 'delete', 'export'];

type PermMap = Record<string, Record<string, boolean>>;

export const DEFAULT_PERMISSIONS: Record<string, PermMap> = {
  owner: {
    dashboard: { view: true, create: true, edit: true, delete: true, export: true },
    properties: { view: true, create: true, edit: true, delete: true, export: true },
    contacts: { view: true, create: true, edit: true, delete: true, export: true },
    demands: { view: true, create: true, edit: true, delete: true, export: true },
    leads: { view: true, create: true, edit: true, delete: true, export: true },
    portals: { view: true, create: true, edit: true, delete: true, export: true },
    team: { view: true, create: true, edit: true, delete: true, export: true },
    settings: { view: true, create: true, edit: true, delete: true, export: true },
    reports: { view: true, create: true, edit: true, delete: true, export: true },
  },
  admin: {
    dashboard: { view: true, create: true, edit: true, delete: true, export: true },
    properties: { view: true, create: true, edit: true, delete: true, export: true },
    contacts: { view: true, create: true, edit: true, delete: true, export: true },
    demands: { view: true, create: true, edit: true, delete: true, export: true },
    leads: { view: true, create: true, edit: true, delete: true, export: true },
    portals: { view: true, create: true, edit: true, delete: true, export: true },
    team: { view: true, create: true, edit: true, delete: true, export: false },
    settings: { view: true, create: true, edit: true, delete: false, export: false },
    reports: { view: true, create: false, edit: false, delete: false, export: true },
  },
  manager: {
    dashboard: { view: true, create: false, edit: false, delete: false, export: true },
    properties: { view: true, create: true, edit: true, delete: false, export: true },
    contacts: { view: true, create: true, edit: true, delete: false, export: true },
    demands: { view: true, create: true, edit: true, delete: false, export: false },
    leads: { view: true, create: true, edit: true, delete: false, export: true },
    portals: { view: true, create: false, edit: false, delete: false, export: false },
    team: { view: true, create: false, edit: true, delete: false, export: false },
    settings: { view: false, create: false, edit: false, delete: false, export: false },
    reports: { view: true, create: false, edit: false, delete: false, export: true },
  },
  agent_senior: {
    dashboard: { view: true, create: false, edit: false, delete: false, export: false },
    properties: { view: true, create: true, edit: true, delete: false, export: true },
    contacts: { view: true, create: true, edit: true, delete: false, export: false },
    demands: { view: true, create: true, edit: true, delete: false, export: false },
    leads: { view: true, create: true, edit: true, delete: false, export: false },
    portals: { view: true, create: false, edit: false, delete: false, export: false },
    team: { view: true, create: false, edit: false, delete: false, export: false },
    settings: { view: false, create: false, edit: false, delete: false, export: false },
    reports: { view: true, create: false, edit: false, delete: false, export: false },
  },
  agent: {
    dashboard: { view: true, create: false, edit: false, delete: false, export: false },
    properties: { view: true, create: true, edit: true, delete: false, export: false },
    contacts: { view: true, create: true, edit: true, delete: false, export: false },
    demands: { view: true, create: true, edit: true, delete: false, export: false },
    leads: { view: true, create: true, edit: true, delete: false, export: false },
    portals: { view: true, create: false, edit: false, delete: false, export: false },
    team: { view: false, create: false, edit: false, delete: false, export: false },
    settings: { view: false, create: false, edit: false, delete: false, export: false },
    reports: { view: false, create: false, edit: false, delete: false, export: false },
  },
  assistant: {
    dashboard: { view: true, create: false, edit: false, delete: false, export: false },
    properties: { view: true, create: false, edit: false, delete: false, export: false },
    contacts: { view: true, create: true, edit: false, delete: false, export: false },
    demands: { view: true, create: true, edit: false, delete: false, export: false },
    leads: { view: true, create: false, edit: false, delete: false, export: false },
    portals: { view: false, create: false, edit: false, delete: false, export: false },
    team: { view: false, create: false, edit: false, delete: false, export: false },
    settings: { view: false, create: false, edit: false, delete: false, export: false },
    reports: { view: false, create: false, edit: false, delete: false, export: false },
  },
};
