import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { scoreMatch } from '../lib/match-score.ts';

const backupArg = process.argv.find((argument) => argument.startsWith('--backup='));
if (!backupArg) {
  console.error('Utilizare: node scripts/audit-demand-matching.mjs --backup=<director-backup>');
  process.exit(1);
}
const backup = resolve(backupArg.slice('--backup='.length));
const [demands, properties] = await Promise.all([
  readFile(resolve(backup, 'demands.json'), 'utf8').then(JSON.parse),
  readFile(resolve(backup, 'properties.json'), 'utf8').then(JSON.parse),
]);

function legacyNumber(criteria, ...keys) {
  for (const key of keys) {
    const raw = criteria?.[key];
    if (raw === null || raw === undefined || raw === '') continue;
    const value = Number(raw);
    if (Number.isFinite(value) && value >= 0) return value;
  }
  return null;
}

const projectedDemands = demands.map((demand) => ({
  ...demand,
  intent: demand.intent || (demand.transaction === 'inchiriere' ? 'inchiriere' : 'cumparare'),
  property_types: demand.property_types?.length ? demand.property_types : demand.category ? [demand.category] : [],
  budget_unknown: demand.budget_unknown ?? (demand.budget_min == null && demand.budget_max == null),
  rooms_min: demand.rooms_min ?? legacyNumber(demand.criteria, 'nr_camere_min', 'nr_camere'),
  rooms_max: demand.rooms_max ?? legacyNumber(demand.criteria, 'nr_camere_max'),
  usable_area_min: demand.usable_area_min ?? legacyNumber(demand.criteria, 'suprafata_min', 'sup_utila'),
  usable_area_max: demand.usable_area_max ?? legacyNumber(demand.criteria, 'suprafata_max'),
  land_area_min: demand.land_area_min ?? legacyNumber(demand.criteria, 'teren_min', 'sup_teren'),
  land_area_max: demand.land_area_max ?? legacyNumber(demand.criteria, 'teren_max'),
}));
const activeProperties = properties.filter((property) => property.status === 'activa' && !property.deleted_at);
let evaluatedPairs = 0;
let eligiblePairs = 0;
let recommendedPairs = 0;
for (const demand of projectedDemands.filter((item) => item.status === 'activa' && !item.deleted_at)) {
  for (const property of activeProperties) {
    if (property.transaction !== demand.transaction) continue;
    if (!demand.property_types.includes(property.category)) continue;
    evaluatedPairs += 1;
    const result = scoreMatch(property, demand);
    if (result.eligible) eligiblePairs += 1;
    if (result.eligible && result.score >= 40) recommendedPairs += 1;
  }
}

const report = {
  mode: 'dry-run',
  writesPerformed: 0,
  input: { demands: demands.length, properties: properties.length, activeProperties: activeProperties.length },
  links: {
    demandsWithClient: demands.filter((demand) => demand.contact_id).length,
    demandsWithoutClient: demands.filter((demand) => !demand.contact_id).length,
  },
  criteria: {
    knownBudget: demands.filter((demand) => demand.budget_min != null || demand.budget_max != null).length,
    projectedUnknownBudget: projectedDemands.filter((demand) => demand.budget_unknown).length,
    withCities: demands.filter((demand) => demand.cities?.length).length,
    withRooms: projectedDemands.filter((demand) => demand.rooms_min != null || demand.rooms_max != null).length,
    withUsableArea: projectedDemands.filter((demand) => demand.usable_area_min != null || demand.usable_area_max != null).length,
    withLandArea: projectedDemands.filter((demand) => demand.land_area_min != null || demand.land_area_max != null).length,
  },
  projectedMatching: { evaluatedPairs, eligiblePairs, recommendedPairs, minimumAlertScore: 40 },
  safeguards: {
    missingBudgetTreatedAsZero: false,
    missingCriteriaAwardPoints: false,
    clientMessagesAutomaticallySent: false,
    historicalRowsDeleted: false,
  },
};
console.log(JSON.stringify(report, null, 2));
