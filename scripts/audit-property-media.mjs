import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const backupArg = process.argv.find((argument) => argument.startsWith('--backup='));
if (!backupArg) {
  console.error('Utilizare: node scripts/audit-property-media.mjs --backup=<director-backup>');
  process.exit(1);
}
const backup = resolve(backupArg.slice('--backup='.length));
const load = (name) => readFile(resolve(backup, `${name}.json`), 'utf8').then(JSON.parse);
const [properties, rows] = await Promise.all([load('properties'), load('property_photos')]);

const pathFromUrl = (url) => {
  try {
    const parsed = new URL(url);
    const marker = '/storage/v1/object/public/property-photos/';
    const index = parsed.pathname.indexOf(marker);
    return index < 0 ? null : decodeURIComponent(parsed.pathname.slice(index + marker.length));
  } catch {
    return null;
  }
};
const activeProperties = properties.filter((property) => !property.deleted_at);
const urls = activeProperties.flatMap((property) => {
  const photos = Array.isArray(property.attributes?.photos) ? property.attributes.photos : [];
  return photos.map((url, index) => ({
    property_id: property.id,
    agency_id: property.agency_id,
    url,
    storage_path: pathFromUrl(url),
    sort_order: index,
  }));
});
const rowKeys = new Set(rows.map((row) => `${row.property_id}|${row.storage_path}`));
const urlKeys = new Set(urls.map((item) => `${item.property_id}|${item.storage_path}`));
const propertyIdsWithUrls = [...new Set(urls.map((item) => item.property_id))];

console.log(JSON.stringify({
  backup,
  properties: activeProperties.length,
  properties_with_photos: propertyIdsWithUrls.length,
  attribute_photo_urls: urls.length,
  unique_attribute_photo_urls: new Set(urls.map((item) => item.url)).size,
  media_catalog_rows: rows.length,
  urls_missing_catalog_row: urls.filter((item) => item.storage_path && !rowKeys.has(`${item.property_id}|${item.storage_path}`)).length,
  catalog_rows_not_in_gallery: rows.filter((row) => !urlKeys.has(`${row.property_id}|${row.storage_path}`)).length,
  properties_without_exactly_one_cover: propertyIdsWithUrls.filter((propertyId) =>
    rows.filter((row) => row.property_id === propertyId && row.is_cover).length !== 1).length,
  invalid_or_cross_tenant_urls: urls.filter((item) =>
    !item.storage_path || !item.storage_path.startsWith(`${item.agency_id}/${item.property_id}/`)).length,
  action: 'dry-run only; migration backfills metadata and never deletes historical files',
}, null, 2));
