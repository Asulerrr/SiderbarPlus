import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

test('panel state is emitted from the presented panel, not the requested panel', async () => {
  const source = await readFile(join(testDir, '../PanelManager.ts'), 'utf8');
  assert.match(source, /activePanelId:\s*this\.presentedPanelId/);
});

test('panel switch attaches target content before publishing its metadata', async () => {
  const source = await readFile(join(testDir, '../PanelManager.ts'), 'utf8');
  const switchStart = source.indexOf('private async switchPanel');
  const switchEnd = source.indexOf('private prepareView', switchStart);
  const switchSource = source.slice(switchStart, switchEnd);
  const presentationCommit = switchSource.indexOf('commitPresentedPanel(descriptor.id, view)');
  const chromeEmission = switchSource.indexOf('IPC_CHANNELS.chromeFadeIn');
  const stateEmission = switchSource.indexOf('this.emitState(this.edge, this.panelMode)');

  assert.ok(presentationCommit >= 0);
  assert.ok(chromeEmission > presentationCommit);
  assert.ok(stateEmission > presentationCommit);
  assert.doesNotMatch(switchSource, /waitForViewReady|commitPresentedPanel\(descriptor\.id, null\)/);
});

test('presentation commit uses the singular BrowserView slot and verifies it', async () => {
  const source = await readFile(join(testDir, '../PanelManager.ts'), 'utf8');
  const setActiveStart = source.indexOf('private setActiveView');
  const setActiveEnd = source.indexOf('private updateViewBounds', setActiveStart);
  const setActiveSource = source.slice(setActiveStart, setActiveEnd);

  assert.match(setActiveSource, /setBrowserView\(view\)/);
  assert.match(setActiveSource, /getBrowserView\(\) !== view/);
  assert.doesNotMatch(setActiveSource, /addBrowserView|removeBrowserView/);
});

test('hide cancels pending switches before its first asynchronous operation', async () => {
  const source = await readFile(join(testDir, '../PanelManager.ts'), 'utf8');
  const hideStart = source.indexOf('async hidePanel');
  const hideEnd = source.indexOf('markSticky()', hideStart);
  const hideSource = source.slice(hideStart, hideEnd);
  const switchCancellation = hideSource.indexOf('++this.switchToken');
  const firstAwait = hideSource.indexOf('await ');

  assert.ok(switchCancellation >= 0);
  assert.ok(firstAwait > switchCancellation);
  assert.match(hideSource, /getView\(this\.presentedPanelId\)/);
});

test('dock does not optimistically overwrite the authoritative active panel', async () => {
  const source = await readFile(
    join(testDir, '../../../renderer/dock/App.tsx'),
    'utf8'
  );
  assert.doesNotMatch(source, /activePanelId:\s*id/);
});
