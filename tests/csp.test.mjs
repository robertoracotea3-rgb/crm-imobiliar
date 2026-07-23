import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const [proxySource, nextConfigSource, layoutSource] = await Promise.all([
  readFile(new URL('../proxy.ts', import.meta.url), 'utf8'),
  readFile(new URL('../next.config.ts', import.meta.url), 'utf8'),
  readFile(new URL('../app/layout.tsx', import.meta.url), 'utf8'),
]);

test('HTML responses use request-scoped nonces instead of unsafe inline scripts', () => {
  assert.match(proxySource, /crypto\.randomUUID\(\)/);
  assert.match(proxySource, /script-src 'self' 'nonce-\$\{nonce\}' 'strict-dynamic'/);
  assert.match(proxySource, /requestHeaders\.set\('x-nonce', nonce\)/);
  assert.match(proxySource, /response\.headers\.set\('Content-Security-Policy'/);
  assert.doesNotMatch(proxySource, /script-src[^"`\n]*unsafe-inline/);
});

test('unsafe eval is development-only and static CSP cannot override the nonce policy', () => {
  assert.match(proxySource, /isDev \? " 'unsafe-eval'" : ''/);
  assert.doesNotMatch(nextConfigSource, /Content-Security-Policy/);
});

test('the root CRM shell is dynamically rendered so Next can apply the nonce', () => {
  assert.match(layoutSource, /import \{ connection \} from "next\/server"/);
  assert.match(layoutSource, /await connection\(\)/);
});
