import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const testDir = dirname(fileURLToPath(import.meta.url));

test('panel menu is hydrated before its window becomes visible', async () => {
  const windowSource = await readFile(
    join(testDir, '../PanelMenuWindow.ts'),
    'utf8'
  );
  const rendererSource = await readFile(
    join(testDir, '../../../renderer/panel-menu/App.tsx'),
    'utf8'
  );
  const showStart = windowSource.indexOf('private showWithPayload(');
  const presentStart = windowSource.indexOf(
    'private presentHydratedMenu(',
    showStart
  );
  const showSource = windowSource.slice(showStart, presentStart);

  assert.match(showSource, /this\.window\.hide\(\)/);
  assert.match(showSource, /panelMenuHydrate/);
  assert.doesNotMatch(showSource, /showInactive\(\)/);
  assert.match(windowSource, /renderId !== this\.pendingRenderId/);
  assert.match(windowSource, /backgroundThrottling: false/);
  assert.match(
    windowSource,
    /this\.window\.on\('blur', \(\) => \{\s+if \(this\.window\?\.isVisible\(\)\) this\.dismiss\(\)/
  );
  assert.match(windowSource, /this\.window\.showInactive\(\)/);
  assert.doesNotMatch(windowSource, /this\.window\.focus\(\)/);
  assert.match(rendererSource, /useLayoutEffect\(\(\) => \{/);
  assert.match(rendererSource, /requestAnimationFrame\(\(\) => \{/);
  assert.match(rendererSource, /setTimeout\(\(\) => \{/);
  assert.doesNotMatch(
    rendererSource,
    /requestAnimationFrame\(\(\) => \{\s+paintedFrame = requestAnimationFrame/
  );
  assert.match(rendererSource, /notifyHydrated\(payload\.renderId\)/);
});

test('closing the panel menu cancels a pending presentation', async () => {
  const source = await readFile(join(testDir, '../PanelMenuWindow.ts'), 'utf8');
  const hideStart = source.indexOf('hide(): void');
  const presentStart = source.indexOf(
    'private presentHydratedMenu(',
    hideStart
  );
  const hideSource = source.slice(hideStart, presentStart);

  assert.match(hideSource, /this\.pendingPayload = null/);
  assert.match(hideSource, /this\.cancelPendingPresentation\(\)/);
  assert.match(source, /ipcMain\.removeListener/);
});

test('outside clicks close the menu without activating its transparent window', async () => {
  const windowSource = await readFile(
    join(testDir, '../PanelMenuWindow.ts'),
    'utf8'
  );
  const nativeSource = await readFile(
    join(testDir, '../../services/NativeWindowResize.ts'),
    'utf8'
  );

  assert.match(windowSource, /const OUTSIDE_CLICK_POLL_MS = 16/);
  assert.match(windowSource, /isLeftMouseButtonDown\(\)/);
  assert.match(windowSource, /screen\.getCursorScreenPoint\(\)/);
  assert.match(windowSource, /if \(!isInside\) \{\s+this\.dismiss\(\)/);
  assert.match(windowSource, /this\.stopOutsideClickTracking\(\)/);
  assert.match(
    windowSource,
    /private dismiss\(\): void \{\s+this\.hide\(\);\s+this\.onDismiss\(\)/
  );
  assert.match(nativeSource, /GetAsyncKeyState/);
  assert.match(nativeSource, /getAsyncKeyState\(VK_LBUTTON\) & 0x8000/);
});

test('autonomous menu dismissal restores panel hover behavior', async () => {
  const windowManagerSource = await readFile(
    join(testDir, '../WindowManager.ts'),
    'utf8'
  );
  const panelManagerSource = await readFile(
    join(testDir, '../../panels/PanelManager.ts'),
    'utf8'
  );
  const rendererSource = await readFile(
    join(testDir, '../../../renderer/panel-menu/App.tsx'),
    'utf8'
  );

  assert.match(
    windowManagerSource,
    /new PanelMenuWindow\(\(\) => \{\s+this\.panelManager\?\.resumeHoverAfterMenuClose\(\)/
  );
  assert.match(
    panelManagerSource,
    /resumeHoverAfterMenuClose\(\): void \{[\s\S]*?this\.sticky = false/
  );
  assert.match(
    rendererSource,
    /onMouseLeave=\{\(\) => \{\s+void window\.panelMenuAPI\.closeMenuAndResumeHover\(\)/
  );
});
