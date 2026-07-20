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
  const presentationCommit = switchSource.indexOf(
    'commitPresentedPanel(descriptor.id, view)'
  );
  const presentationFence = switchSource.indexOf(
    'waitForPresentationFrame(descriptor.id)'
  );
  const chromeEmission = switchSource.indexOf('IPC_CHANNELS.chromeFadeIn');
  const stateEmission = switchSource.indexOf(
    'this.emitState(this.edge, this.panelMode)'
  );

  assert.ok(presentationCommit >= 0);
  assert.ok(presentationFence > presentationCommit);
  assert.ok(chromeEmission > presentationFence);
  assert.ok(stateEmission > presentationFence);
  assert.doesNotMatch(
    switchSource,
    /waitForViewReady|commitPresentedPanel\(descriptor\.id, null\)/
  );
});

test('presentation commit uses the singular BrowserView slot and verifies it', async () => {
  const source = await readFile(join(testDir, '../PanelManager.ts'), 'utf8');
  const setActiveStart = source.indexOf('private setActiveView');
  const setActiveEnd = source.indexOf(
    'private updateViewBounds',
    setActiveStart
  );
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
  const pointerTrackingStop = hideSource.indexOf('this.stopPointerTracking()');
  const firstAwait = hideSource.indexOf('await ');

  assert.ok(switchCancellation >= 0);
  assert.ok(pointerTrackingStop >= 0);
  assert.ok(pointerTrackingStop < firstAwait);
  assert.ok(firstAwait > switchCancellation);
  assert.match(hideSource, /getView\(this\.presentedPanelId\)/);
  assert.match(hideSource, /await sleep\(CLOSE_REMAINING_ANIMATION_MS\)/);
});

test('dock does not optimistically overwrite the authoritative active panel', async () => {
  const source = await readFile(
    join(testDir, '../../../renderer/dock/App.tsx'),
    'utf8'
  );
  assert.doesNotMatch(source, /activePanelId:\s*id/);
});

test('opening in an external browser preserves hover auto-hide', async () => {
  const managerSource = await readFile(
    join(testDir, '../PanelManager.ts'),
    'utf8'
  );
  const toolbarSource = await readFile(
    join(testDir, '../../../renderer/panel-chrome/components/ChromeToolbar.tsx'),
    'utf8'
  );
  const openStart = managerSource.indexOf('async openExternal(');
  const openEnd = managerSource.indexOf('async goBack(', openStart);
  const openSource = managerSource.slice(openStart, openEnd);
  const buttonStart = toolbarSource.indexOf('title="在浏览器中打开"');
  const buttonEnd = toolbarSource.indexOf('</button>', buttonStart);
  const buttonSource = toolbarSource.slice(buttonStart, buttonEnd);

  assert.match(openSource, /finally \{\s+this\.resumeHover\(\)/);
  assert.match(
    buttonSource,
    /onMouseDown=\{\(event\) => event\.stopPropagation\(\)\}/
  );
});

test('interrupted transitions never reveal the stale real panel', async () => {
  const source = await readFile(join(testDir, '../PanelManager.ts'), 'utf8');
  const interruptedStart = source.indexOf(
    "if (this.state === 'opening' || this.state === 'closing')"
  );
  const interruptedEnd = source.indexOf(
    "this.state = 'opening'",
    interruptedStart
  );
  const interruptedSource = source.slice(interruptedStart, interruptedEnd);

  assert.ok(interruptedStart >= 0);
  assert.match(interruptedSource, /this\.panelWindow\.hide\(\)/);
  assert.match(interruptedSource, /this\.resetAnimationWindow\(\)/);
  assert.doesNotMatch(interruptedSource, /this\.panelWindow\.show\(\)/);
});

test('opening prepares the hidden panel and paints it below the animation before handoff', async () => {
  const source = await readFile(join(testDir, '../PanelManager.ts'), 'utf8');
  const openingStart = source.indexOf("this.state = 'opening'");
  const animationWait = source.indexOf(
    'await sleep(OPEN_ANIMATION_MS)',
    openingStart
  );
  const presentationFence = source.indexOf(
    'await this.webPanelHost.waitForPresentationFrame(descriptor.id)',
    animationWait
  );
  const handoffEnd = source.indexOf(
    'this.cancelCloseTimer()',
    presentationFence
  );
  const beforeAnimation = source.slice(openingStart, animationWait);
  const coveredPaint = source.slice(animationWait, presentationFence);
  const handoff = source.slice(presentationFence, handoffEnd);

  assert.ok(openingStart >= 0);
  assert.match(beforeAnimation, /this\.panelWindow\.hide\(\)/);
  assert.match(beforeAnimation, /this\.sendAnimateIn\(/);
  assert.match(beforeAnimation, /this\.presentDescriptorView\(/);
  assert.match(beforeAnimation, /this\.sendAnimationOpen\(/);
  assert.doesNotMatch(beforeAnimation, /this\.panelWindow\.show\(\)/);
  assert.match(coveredPaint, /this\.panelWindow\.show\(\)/);
  assert.match(coveredPaint, /this\.coverPanelWithAnimation\(\)/);
  assert.match(handoff, /await sleep\(PRESENTATION_COMPOSITOR_SETTLE_MS\)/);
  assert.match(handoff, /this\.resetAnimationWindow\(\)/);
  assert.match(handoff, /this\.revealPanelWindow\(\)/);
});

test('animation and real panel share title bar text colors', async () => {
  const animationSource = await readFile(
    join(testDir, '../../../renderer/panel-animation/App.tsx'),
    'utf8'
  );
  const panelSource = await readFile(
    join(testDir, '../../../renderer/panel-chrome/App.tsx'),
    'utf8'
  );

  assert.match(animationSource, /getMutedForeground\(surface\.bg\)/);
  assert.match(panelSource, /getMutedForeground\(surface\.bg\)/);
  assert.doesNotMatch(animationSource, /text-white\/42/);
});

test('animation and real panel use the same title bar font', async () => {
  const animationCss = await readFile(
    join(testDir, '../../../renderer/panel-animation/panel-animation.css'),
    'utf8'
  );
  const panelCss = await readFile(
    join(testDir, '../../../renderer/panel-chrome/panel.css'),
    'utf8'
  );
  const readBodyFont = (source: string): string | undefined =>
    source.match(/body\s*\{[\s\S]*?font-family:\s*([^;]+);/)?.[1].replace(/\s+/g, ' ');

  assert.equal(readBodyFont(animationCss), readBodyFont(panelCss));
  assert.match(animationCss, /font-feature-settings: 'cv01', 'cv11'/);
});

test('animation snapshot and BrowserView share vertical content bounds', async () => {
  const source = await readFile(join(testDir, '../PanelManager.ts'), 'utf8');
  const boundsStart = source.indexOf('private updateViewBounds(');
  const boundsEnd = source.indexOf('private bindViewEvents(', boundsStart);
  const boundsSource = source.slice(boundsStart, boundsEnd);

  assert.match(
    boundsSource,
    /y: PANEL_TOP_INSET \+ PANEL_BORDER_WIDTH \+ CHROME_HEIGHT/
  );
  assert.match(boundsSource, /PANEL_BORDER_WIDTH \* 2/);
});

test('rapid close cannot be overwritten by stale opening frames', async () => {
  const animationSource = await readFile(
    join(testDir, '../../../renderer/panel-animation/App.tsx'),
    'utf8'
  );

  assert.match(animationSource, /const transitionId = \+\+transitionIdRef\.current/);
  assert.match(
    animationSource,
    /if \(transitionId !== transitionIdRef\.current\) return;\s+setPhase\('opening'\)/
  );
  assert.match(
    animationSource,
    /if \(transitionId !== transitionIdRef\.current\) return;\s+setPhase\('closing'\)/
  );
});

test('panel handoff waits for the target view post-paint acknowledgement', async () => {
  const hostSource = await readFile(join(testDir, '../WebPanelHost.ts'), 'utf8');
  const preloadSource = await readFile(
    join(testDir, '../../../preload/webPanel.ts'),
    'utf8'
  );

  assert.match(hostSource, /event\.sender !== view\.webContents/);
  assert.match(hostSource, /readyRequestId !== requestId/);
  assert.match(hostSource, /PRESENTATION_FRAME_TIMEOUT_MS/);
  assert.match(hostSource, /removeListener\(/);
  assert.match(
    preloadSource,
    /requestAnimationFrame\(\(\) => \{\s+window\.setTimeout\(\(\) => \{[\s\S]*?panelViewPresentationReady/
  );
});
