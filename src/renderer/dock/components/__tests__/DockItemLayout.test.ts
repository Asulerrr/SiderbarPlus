import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

test('dock icons do not shrink inside the scroll container', async () => {
  const source = await readFile(join(testDir, '../DockItem.tsx'), 'utf8');

  assert.match(source, /shrink-0/);
});
