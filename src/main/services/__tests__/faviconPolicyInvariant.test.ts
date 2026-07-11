import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

test('favicon loading uses only the target site and has bounded parallel attempts', async () => {
  const service = await readFile(join(testDir, '../FaviconService.ts'), 'utf8');
  const dockItem = await readFile(
    join(testDir, '../../../renderer/dock/components/DockItem.tsx'),
    'utf8'
  );

  assert.doesNotMatch(service, /google\.com\/s2\/favicons/i);
  assert.doesNotMatch(dockItem, /icons\.duckduckgo\.com/i);
  assert.match(service, /const REQUEST_TIMEOUT_MS = 2500/);
  assert.match(service, /const CACHE_KEY_VERSION = 2/);
  assert.match(service, /Promise\.any\(/);
});

test('adding a site does not wait for favicon and failures are not cached', async () => {
  const service = await readFile(join(testDir, '../FaviconService.ts'), 'utf8');
  const panelChrome = await readFile(
    join(testDir, '../../../renderer/panel-chrome/App.tsx'),
    'utf8'
  );
  const panelHandlers = await readFile(join(testDir, '../../ipc/panelHandlers.ts'), 'utf8');

  assert.doesNotMatch(service, /writeFile\(cachePath, fallbackBuffer\)/);
  assert.doesNotMatch(panelChrome, /await resolveIconSource\(/);
  assert.match(panelHandlers, /refreshFaviconInBackground\(nextPanel\.id, nextPanel\.web\.url\)/);
});
