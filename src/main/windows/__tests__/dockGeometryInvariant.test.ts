import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

test('geometry transitions preserve the requested visibility state', async () => {
  const source = await readFile(join(testDir, '../DockWindow.ts'), 'utf8');
  const begin = source.indexOf('beginGeometryTransition()');
  const finish = source.indexOf('finishGeometryTransition(', begin);
  const transitionSource = source.slice(
    begin,
    source.indexOf('private assertPosition', finish)
  );

  assert.doesNotMatch(transitionSource, /this\.visible\s*=/);
  assert.match(transitionSource, /if \(this\.visible\)/);
});

test('geometry transitions never trigger the renderer entrance animation', async () => {
  const source = await readFile(join(testDir, '../DockWindow.ts'), 'utf8');
  const begin = source.indexOf('beginGeometryTransition()');
  const finish = source.indexOf('finishGeometryTransition(', begin);
  const transitionSource = source.slice(
    begin,
    source.indexOf('private assertPosition', finish)
  );

  assert.doesNotMatch(transitionSource, /dockWillShow/);
});

test('AppBar registration has no delayed visible position assertions', async () => {
  const source = await readFile(join(testDir, '../WindowManager.ts'), 'utf8');
  const register = source.indexOf('private registerDockAppBar()');
  const stabilize = source.indexOf('private stabilizeDockGeometry(', register);

  assert.doesNotMatch(source.slice(register, stabilize), /setTimeout/);
});
