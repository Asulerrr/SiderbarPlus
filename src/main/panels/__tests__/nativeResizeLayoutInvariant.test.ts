import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

test('web panels do not use BrowserView post-resize auto layout', async () => {
  const source = await readFile(join(testDir, '../WebPanelHost.ts'), 'utf8');

  assert.match(source, /new BrowserView\(/);
  assert.doesNotMatch(source, /setAutoResize\(/);
  assert.doesNotMatch(source, /new WebContentsView\(/);
});

test('active web content uses the window singular BrowserView slot', async () => {
  const source = await readFile(join(testDir, '../PanelManager.ts'), 'utf8');
  const attachStart = source.indexOf('private setActiveView(');
  const attachEnd = source.indexOf('private updateViewBounds(', attachStart);
  const attachSource = source.slice(attachStart, attachEnd);

  assert.match(attachSource, /setBrowserView\(view\)/);
  assert.match(attachSource, /getBrowserView\(\) !== view/);
  assert.doesNotMatch(attachSource, /addBrowserView|removeBrowserView/);
  assert.doesNotMatch(attachSource, /contentView\.addChildView/);
});

test('right-docked web content keeps its right edge fixed during native resize', async () => {
  const source = await readFile(join(testDir, '../PanelManager.ts'), 'utf8');

  assert.match(source, /on\('will-resize', \(event, newBounds, details\) =>/);
  assert.match(source, /anchorViewBeforeNativeResize\(newBounds\)/);
  assert.match(source, /if \(this\.edge !== 'right'\) return/);
  assert.match(source, /getRightAnchoredViewX\(targetContentWidth, viewBounds\.width\)/);
  assert.match(source, /on\('resize', \(\) => this\.layoutViewAfterNativeResize\(\)\)/);
  assert.doesNotMatch(source, /contentView\.on\('bounds-changed'/);
  assert.doesNotMatch(source, /private syncNativeResize\(\)/);
});

test('native resize pins the cursor to the actual window edge', async () => {
  const resizeHandle = await readFile(
    join(testDir, '../../../renderer/panel-chrome/components/ResizeHandle.tsx'),
    'utf8'
  );
  const nativeResize = await readFile(
    join(testDir, '../../services/NativeWindowResize.ts'),
    'utf8'
  );
  const windowManager = await readFile(
    join(testDir, '../../windows/WindowManager.ts'),
    'utf8'
  );
  const panelWindow = await readFile(
    join(testDir, '../../windows/PanelWindow.ts'),
    'utf8'
  );

  assert.match(resizeHandle, /startResize\(\{ x: event\.screenX, y: event\.screenY \}\)/);
  assert.match(windowManager, /startNativeResize\(point\)/);
  assert.match(panelWindow, /resizeEdge === 'left' \? bounds\.x : bounds\.x \+ bounds\.width/);
  assert.match(panelWindow, /screen\.dipToScreenPoint\(\{ x: edgeX, y: point\.y \}\)/);
  assert.match(nativeResize, /setCursorPos\(edgePoint\.x, edgePoint\.y\)/);
  assert.match(nativeResize, /packPoint\(edgePoint\)/);
  assert.doesNotMatch(nativeResize, /GetCursorPos/);
});

test('native resize fills transient uncovered areas with the panel surface color', async () => {
  const panelWindow = await readFile(join(testDir, '../../windows/PanelWindow.ts'), 'utf8');
  const panelManager = await readFile(join(testDir, '../PanelManager.ts'), 'utf8');
  const configHandlers = await readFile(join(testDir, '../../ipc/configHandlers.ts'), 'utf8');

  assert.match(panelWindow, /private resizeBackdrop: BrowserWindow \| null = null/);
  assert.match(panelWindow, /transparent: true/);
  assert.match(panelWindow, /backgroundColor: '#00000000'/);
  assert.match(panelWindow, /this\.resizeBackdrop = new BrowserWindow\(\{/);
  assert.match(panelWindow, /transparent: false/);
  assert.match(panelWindow, /backgroundColor: getPanelBackgroundColor\(this\.config\)/);
  assert.match(panelWindow, /backgroundThrottling: false/);
  assert.match(panelWindow, /this\.resizeBackdrop\.loadURL\(getResizeBackdropDataUrl\(this\.config\)\)/);
  assert.match(panelWindow, /this\.resizeBackdrop\?\.setOpacity\(1\)/);
  assert.match(panelWindow, /this\.resizeBackdrop\.setOpacity\(0\)/);
  assert.match(panelWindow, /resolveSurfaceColors\(config\.appearance, true\)/);
  assert.match(panelWindow, /return `#\$\{hex\(r\)\}\$\{hex\(g\)\}\$\{hex\(b\)\}`/);
  assert.match(panelWindow, /this\.resizeBackdrop\.setBackgroundColor\(getPanelBackgroundColor\(config\)\)/);
  assert.match(panelManager, /this\.panelWindow\.updateResizeBackdrop\(newBounds\)/);
  assert.match(panelManager, /this\.panelWindow\.finishResizeBackdrop\(\)/);
  assert.match(configHandlers, /windowManager\.getPanelWindow\(\)\?\.updateConfig\(config\)/);
});
