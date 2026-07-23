import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const backupArg = process.argv.find((argument) => argument.startsWith('--backup='));
if (!backupArg) {
  console.error('Utilizare: node scripts/audit-transactions.mjs --backup=<director-backup>');
  process.exit(1);
}
const backup = resolve(backupArg.slice('--backup='.length));
const load = (name) => readFile(resolve(backup, `${name}.json`), 'utf8').then(JSON.parse);
const [transactions, properties, contacts, listings] = await Promise.all([
  load('transactions'), load('properties'), load('contacts'), load('portal_listings'),
]);
const propertyIds = new Set(properties.map((row) => row.id));
const contactIds = new Set(contacts.map((row) => row.id));
const listingProperties = new Set(listings.map((row) => row.property_id));
const active = transactions.filter((row) => !row.deleted_at);

console.log(JSON.stringify({
  backup,
  transactions: active.length,
  missing_contact_id: active.filter((row) => !row.contact_id).length,
  invalid_contact_reference: active.filter((row) => row.contact_id && !contactIds.has(row.contact_id)).length,
  missing_property_id: active.filter((row) => !row.property_id).length,
  invalid_property_reference: active.filter((row) => row.property_id && !propertyIds.has(row.property_id)).length,
  missing_agent_id: active.filter((row) => !row.agent_id).length,
  non_positive_price: active.filter((row) => !(Number(row.sale_price) > 0)).length,
  transactions_with_portal_listing: active.filter((row) => listingProperties.has(row.property_id)).length,
  projected_legacy_imports: active.filter((row) =>
    !row.property_id || !propertyIds.has(row.property_id) || !row.contact_id
    || !contactIds.has(row.contact_id) || !row.agent_id || !(Number(row.sale_price) > 0)).length,
  action: 'dry-run only; no historical link is invented or overwritten',
}, null, 2));
