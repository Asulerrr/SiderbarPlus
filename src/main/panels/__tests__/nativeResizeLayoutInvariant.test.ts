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

test('native resize leaves the interactive sizing loop to Windows', async () => {
  const source = await readFile(join(testDir, '../PanelManager.ts'), 'utf8');
  const willResizeStart = source.indexOf(
    "this.panelWindowRef.on('will-resize'"
  );
  const resizedStart = source.indexOf(
    "this.panelWindowRef.on('resized'",
    willResizeStart
  );
  const willResizeSource = source.slice(willResizeStart, resizedStart);

  assert.match(source, /on\('will-resize', \(event, _newBounds, details\) =>/);
  assert.doesNotMatch(
    willResizeSource,
    /setBounds|updateResizeBackdrop|updateViewBounds/
  );
  assert.doesNotMatch(source, /on\('resize'/);
  assert.doesNotMatch(source, /setImmediate/);
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

  assert.match(
    resizeHandle,
    /startResize\(\{ x: event\.screenX, y: event\.screenY \}\)/
  );
  assert.match(windowManager, /startNativeResize\(point\)/);
  assert.match(
    panelWindow,
    /resizeEdge === 'left' \? bounds\.x : bounds\.x \+ bounds\.width/
  );
  assert.match(
    panelWindow,
    /screen\.dipToScreenPoint\(\{ x: edgeX, y: point\.y \}\)/
  );
  assert.match(nativeResize, /setCursorPos\(edgePoint\.x, edgePoint\.y\)/);
  assert.match(nativeResize, /packPoint\(edgePoint\)/);
  assert.doesNotMatch(nativeResize, /GetCursorPos/);
});

test('native resize uses one opaque panel surface without a follower window', async () => {
  const panelWindow = await readFile(
    join(testDir, '../../windows/PanelWindow.ts'),
    'utf8'
  );
  const panelManager = await readFile(
    join(testDir, '../PanelManager.ts'),
    'utf8'
  );
  const configHandlers = await readFile(
    join(testDir, '../../ipc/configHandlers.ts'),
    'utf8'
  );

  assert.match(panelWindow, /transparent: false/);
  assert.match(
    panelWindow,
    /backgroundColor: getPanelBackgroundColor\(this\.config\)/
  );
  assert.match(panelWindow, /backgroundThrottling: false/);
  assert.doesNotMatch(panelWindow, /resizeBackdrop|setOpacity/);
  assert.doesNotMatch(panelManager, /setOpacity/);
  assert.match(panelWindow, /resolveSurfaceColors\(config\.appearance, true\)/);
  assert.match(
    panelWindow,
    /return `#\$\{hex\(r\)\}\$\{hex\(g\)\}\$\{hex\(b\)\}`/
  );
  assert.match(
    panelWindow,
    /this\.window\.setBackgroundColor\(getPanelBackgroundColor\(config\)\)/
  );
  assert.match(
    configHandlers,
    /windowManager\.getPanelWindow\(\)\?\.updateConfig\(config\)/
  );
});
