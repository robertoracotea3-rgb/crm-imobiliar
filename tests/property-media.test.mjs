import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import {
  nextPropertyMediaCleanupAttempt,
  normalizeExistingPropertyMedia,
  propertyPhotoBelongsTo,
  propertyPhotoStoragePath,
} from '../lib/property-media.ts';
import { normalizePropertyWrite } from '../lib/property-form.ts';

const agencyId = 'aaaaaaaa-0000-0000-0000-000000000001';
const propertyId = '11111111-0000-0000-0000-000000000001';
const url = `https://example.supabase.co/storage/v1/object/public/property-photos/${agencyId}/${propertyId}/hash/medium.webp`;
const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('property photo paths are parsed and tenant scoped', () => {
  const path = `${agencyId}/${propertyId}/hash/medium.webp`;
  assert.equal(propertyPhotoStoragePath(url), path);
  assert.equal(propertyPhotoBelongsTo(path, agencyId, propertyId), true);
  assert.equal(propertyPhotoBelongsTo(path, 'bbbbbbbb-0000-0000-0000-000000000001', propertyId), false);
  assert.equal(propertyPhotoStoragePath('https://example.com/not-the-bucket/photo.webp'), null);
});

test('existing media is deduplicated and receives safe metadata defaults', () => {
  const media = normalizeExistingPropertyMedia([
    { url, alt_text: '  Living luminos  ', description: ' Fotografie principală ' },
    url,
    'https://attacker.example/photo.webp',
  ], agencyId, propertyId, 'Apartament central');
  assert.equal(media.length, 1);
  assert.equal(media[0].alt_text, 'Living luminos');
  assert.equal(media[0].description, 'Fotografie principală');
});

test('property writes share strict server-side validation', () => {
  const valid = normalizePropertyWrite({
    title: ' Apartament ',
    price: '75000',
    category: 'apartament',
    transaction: 'vanzare',
    status: 'activa',
    attributes: { currency: 'EUR', judet: 'Brașov', localitate: 'Făgăraș' },
  }, { mode: 'create' });
  assert.deepEqual(valid.errors, []);
  assert.equal(valid.columns.title, 'Apartament');
  assert.equal(valid.columns.city, 'Făgăraș');
  assert.deepEqual(valid.attributes.publicare, {
    site: false, imobiliare: false, olx: false, storia: false, facebook: false,
  });

  const invalid = normalizePropertyWrite({
    title: '',
    price: -1,
    category: 'inventat',
    transaction: 'necunoscut',
    attributes: { currency: 'BTC', lat: 100 },
  }, { mode: 'create' });
  assert.ok(invalid.errors.length >= 5);
});

test('cleanup retries use bounded exponential delay', () => {
  const now = Date.parse('2026-07-20T10:00:00Z');
  assert.equal(nextPropertyMediaCleanupAttempt(1, now), '2026-07-20T10:05:00.000Z');
  assert.equal(nextPropertyMediaCleanupAttempt(2, now), '2026-07-20T10:10:00.000Z');
  assert.equal(nextPropertyMediaCleanupAttempt(20, now), '2026-07-20T22:00:00.000Z');
});

test('upload persists the database state before physical cleanup', async () => {
  const route = await read('app/api/properties/upload-photos/route.ts');
  const syncIndex = route.indexOf("rpc('crm_sync_property_media'");
  const cleanupIndex = route.indexOf('const cleanup = await processPropertyMediaCleanupJobs');
  assert.ok(syncIndex > 0);
  assert.ok(cleanupIndex > syncIndex);
  assert.doesNotMatch(route, /deleteOrphanPhotos/);
  assert.match(route, /upload_without_database_commit/);
  const update = await read('app/api/properties/update-full/route.ts');
  assert.match(update, /Galeria este sincronizată numai de fluxul media atomic/);
  assert.match(update, /photos:\s*Array\.isArray\(oldAttributes\.photos\)/);
});

test('editing with no new photos still synchronizes an empty gallery', async () => {
  const editor = await read('app/properties/[id]/edit/complete/page.tsx');
  assert.match(editor, /replacePhotos:\s*true/);
  assert.match(editor, /existingMedia:\s*existingPhotos\.map/);
  assert.doesNotMatch(editor, /photos\.length > 0 \|\| existingPhotos\.length > 0/);
  const legacyEditor = await read('app/properties/[id]/edit/page.tsx');
  assert.match(legacyEditor, /redirect\(`\/properties\/\$\{encodeURIComponent\(id\)\}\/edit\/complete`\)/);
});

test('media migration backfills metadata and uses a retryable cleanup queue', async () => {
  const migration = await read('migrations/20260720_130_property_media.sql');
  assert.match(migration, /jsonb_array_elements_text/);
  assert.match(migration, /property_media_cleanup_jobs/);
  assert.match(migration, /crm_sync_property_media/);
  assert.match(migration, /for update skip locked/);
  assert.match(migration, /deleted_at=now\(\).*cleanup_status='pending'/s);
  assert.match(migration, /Exactly the first active image is the cover/);
});
