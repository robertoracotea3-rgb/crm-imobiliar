import assert from 'node:assert/strict';
import test from 'node:test';
import sharp from 'sharp';

test('the security-patched Sharp override loads and processes an image', async () => {
  const source = Buffer.from(
    '<svg xmlns="http://www.w3.org/2000/svg" width="2" height="2"><rect width="2" height="2" fill="#0E6B54"/></svg>',
  );
  const output = await sharp(source).resize(1, 1).webp({ quality: 80 }).toBuffer();
  const metadata = await sharp(output).metadata();

  assert.ok(output.length > 0);
  assert.equal(metadata.format, 'webp');
  assert.equal(metadata.width, 1);
  assert.equal(metadata.height, 1);
});
