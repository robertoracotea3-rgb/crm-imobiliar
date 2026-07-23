import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const read = path => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('mobile navigation keeps core actions one-handed and exposes every required module', async () => {
  const sidebar = await read('components/Sidebar.tsx');
  assert.match(sidebar, /const mobilePrimaryItems = \['\/dashboard', '\/properties', '\/clients', '\/viewings'\]/);
  assert.match(sidebar, />Mai mult</);
  for (const route of ['/prospects', '/portals', '/team', '/notifications', '/settings', '/finance']) {
    assert.match(sidebar, new RegExp(`href: '${route.replace('/', '\\/')}'`));
  }
  assert.match(sidebar, /mobileMoreItems = visibleItems\.filter/);
  assert.match(sidebar, /can\(item\.module, 'view'\)/);
  assert.match(sidebar, /aria-label="Navigație principală mobilă"/);
  assert.match(sidebar, /aria-expanded=\{moreOpen\}/);
});

test('mobile shell handles safe areas, touch targets and reduced motion', async () => {
  const [layout, css] = await Promise.all([
    read('app/layout.tsx'),
    read('app/globals.css'),
  ]);
  assert.match(layout, /min-w-0 w-full/);
  assert.match(layout, /env\(safe-area-inset-bottom\)/);
  assert.match(css, /\.mobile-bottom-nav/);
  assert.match(css, /\.mobile-touch-target/);
  assert.match(css, /min-width: 44px/);
  assert.match(css, /font-size: 16px/);
  assert.match(css, /prefers-reduced-motion/);
});

test('all CRM modal families use the shared mobile sheet behavior', async () => {
  const files = [
    'components/AddPropertyDialog.tsx',
    'components/AddDemandDialog.tsx',
    'components/DemandsList.tsx',
    'components/ReplyLeadDialog.tsx',
    'components/ScheduleViewingDialog.tsx',
    'components/UnmatchedStoriaMessages.tsx',
    'app/calendar/page.tsx',
    'app/clients/page.tsx',
    'app/contacts/page.tsx',
    'app/finance/page.tsx',
    'app/tasks/page.tsx',
    'app/team/page.tsx',
    'app/viewings/page.tsx',
    'app/properties/[id]/page.tsx',
  ];
  for (const file of files) {
    const source = await read(file);
    assert.match(source, /mobile-dialog-backdrop/, `${file} lacks the mobile backdrop`);
    assert.match(source, /mobile-dialog-panel/, `${file} lacks the mobile panel`);
  }
  const css = await read('app/globals.css');
  assert.match(css, /\.mobile-dialog-backdrop/);
  assert.match(css, /max-height: 100dvh/);
  assert.match(css, /\.mobile-dialog-panel \.grid\.grid-cols-2/);
});

test('wide tables become mobile cards or controlled scroll regions', async () => {
  const [portals, team] = await Promise.all([
    read('app/portals/page.tsx'),
    read('app/team/page.tsx'),
  ]);
  assert.match(portals, /space-y-3 md:hidden/);
  assert.match(portals, /ID-uri și sincronizare/);
  assert.match(portals, /hidden rounded-lg border border-gray-200 md:block md:overflow-x-auto/);
  assert.match(portals, /min-w-\[900px\]/);
  assert.match(team, /overflow-x-auto/);
  assert.match(team, /min-w-\[680px\]/);
  assert.match(team, /sticky left-0/);
});

test('property editor actions remain above mobile navigation', async () => {
  const editor = await read('app/properties/[id]/edit/complete/page.tsx');
  assert.match(editor, /mobile-form-page/);
  assert.match(editor, /bottom-\[calc\(4\.5rem\+env\(safe-area-inset-bottom\)\)\]/);
  assert.match(editor, /md:left-64/);
  assert.match(editor, /mobile-touch-target/);
});
