import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  identityLookupKeys,
  normalizeClientEmail,
  normalizeClientPhone,
} from '../lib/client-identity.ts';

const backupArg = process.argv.find((arg) => arg.startsWith('--backup='));
if (!backupArg) {
  console.error('Utilizare: node scripts/audit-client-reconciliation.mjs --backup=<director-backup>');
  process.exit(2);
}

const backupDir = resolve(backupArg.slice('--backup='.length));
const readRows = (name) => {
  const path = resolve(backupDir, `${name}.json`);
  if (!existsSync(path)) return [];
  const parsed = JSON.parse(readFileSync(path, 'utf8'));
  return Array.isArray(parsed) ? parsed : (Array.isArray(parsed.data) ? parsed.data : []);
};

const contacts = readRows('contacts').filter((row) => !row.deleted_at);
const leads = readRows('leads').filter((row) => !row.deleted_at);
const demands = readRows('demands').filter((row) => !row.deleted_at);
const contactIds = new Set(contacts.map((row) => row.id));
const lookup = new Map();

const register = (agencyId, contactId, identity) => {
  for (const key of identityLookupKeys(identity)) {
    const scoped = `${agencyId}:${key}`;
    if (!lookup.has(scoped)) lookup.set(scoped, new Set());
    lookup.get(scoped).add(contactId);
  }
};

for (const contact of contacts) {
  register(contact.agency_id, contact.id, { phone: contact.phone, email: contact.email });
  register(contact.agency_id, contact.id, { phone: contact.phone_secondary || contact.phone2 });
}

const duplicatePairs = new Map();
for (const ids of lookup.values()) {
  const sorted = [...ids].sort();
  for (let left = 0; left < sorted.length; left += 1) {
    for (let right = left + 1; right < sorted.length; right += 1) {
      duplicatePairs.set(`${sorted[left]}:${sorted[right]}`, true);
    }
  }
}

const result = {
  alreadyLinked: 0,
  exactExisting: 0,
  projectedNewContacts: 0,
  linkedToProjectedContact: 0,
  ambiguous: 0,
  noIdentity: 0,
};
const projectedLeadContact = new Map();

for (const lead of [...leads].sort((a, b) => String(a.received_at).localeCompare(String(b.received_at)))) {
  const prelinked = lead.contact_id || lead.converted_contact_id;
  if (prelinked && contactIds.has(prelinked)) {
    projectedLeadContact.set(lead.id, prelinked);
    result.alreadyLinked += 1;
    continue;
  }

  const keys = identityLookupKeys({ phone: lead.contact_phone, email: lead.contact_email });
  if (keys.length === 0) {
    result.noIdentity += 1;
    continue;
  }

  const candidates = new Set();
  for (const key of keys) {
    for (const candidate of lookup.get(`${lead.agency_id}:${key}`) || []) candidates.add(candidate);
  }

  if (candidates.size > 1) {
    result.ambiguous += 1;
    continue;
  }
  if (candidates.size === 1) {
    const contactId = [...candidates][0];
    projectedLeadContact.set(lead.id, contactId);
    if (String(contactId).startsWith('projected:')) result.linkedToProjectedContact += 1;
    else result.exactExisting += 1;
    continue;
  }

  const projectedId = `projected:${lead.id}`;
  projectedLeadContact.set(lead.id, projectedId);
  register(lead.agency_id, projectedId, { phone: lead.contact_phone, email: lead.contact_email });
  result.projectedNewContacts += 1;
}

let demandsRecoverableFromConvertedLead = 0;
for (const demand of demands.filter((row) => !row.contact_id)) {
  const convertedLead = leads.find((lead) => lead.converted_demand_id === demand.id);
  if (convertedLead && projectedLeadContact.has(convertedLead.id)) demandsRecoverableFromConvertedLead += 1;
}

const report = {
  mode: 'dry-run',
  writesPerformed: 0,
  input: {
    contacts: contacts.length,
    leads: leads.length,
    demands: demands.length,
  },
  normalized: {
    contactsWithValidPhone: contacts.filter((row) => normalizeClientPhone(row.phone)).length,
    contactsWithValidEmail: contacts.filter((row) => normalizeClientEmail(row.email)).length,
    leadsWithValidPhone: leads.filter((row) => normalizeClientPhone(row.contact_phone)).length,
    leadsWithValidEmail: leads.filter((row) => normalizeClientEmail(row.contact_email)).length,
  },
  projected: {
    ...result,
    safelyLinkedLeads: result.alreadyLinked + result.exactExisting
      + result.projectedNewContacts + result.linkedToProjectedContact,
    contactDuplicatePairsForReview: duplicatePairs.size,
    demandsAlreadyLinked: demands.filter((row) => row.contact_id).length,
    demandsRecoverableFromConvertedLead,
    demandsStillUnlinked: demands.filter((row) => !row.contact_id).length - demandsRecoverableFromConvertedLead,
  },
  safeguards: {
    nameOnlyMatching: false,
    ambiguousContactsAutoMerged: false,
    historicalRowsDeleted: false,
  },
};

console.log(JSON.stringify(report, null, 2));
