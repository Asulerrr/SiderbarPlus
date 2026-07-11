import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { buildNavigationFailurePageUrl } from '../navigationFailurePage.ts';

const testDir = dirname(fileURLToPath(import.meta.url));

const decodePage = (pageUrl: string): string =>
  decodeURIComponent(pageUrl.slice(pageUrl.indexOf(',') + 1));

test('builds a retryable local page for a failed navigation', () => {
  const pageUrl = buildNavigationFailurePageUrl({
    attemptedUrl: 'https://www.google.com/search?q=sidebar',
    fallbackUrl: 'https://www.google.com',
    errorDescription: 'ERR_CONNECTION_TIMED_OUT'
  });
  const html = decodePage(pageUrl);

  assert.match(pageUrl, /^data:text\/html;charset=utf-8,/);
  assert.match(html, /无法打开此网页/);
  assert.match(html, /www\.google\.com/);
  assert.match(html, /ERR_CONNECTION_TIMED_OUT/);
  assert.match(html, /重新加载/);
  assert.match(html, /location\.replace\(retryUrl\)/);
  assert.match(html, /history\.back\(\)/);
});

test('escapes navigation failure details before embedding them', () => {
  const pageUrl = buildNavigationFailurePageUrl({
    attemptedUrl: 'https://example.com/</script><script>alert(1)</script>',
    fallbackUrl: 'https://example.com',
    errorDescription: '<ERR_FAILED>'
  });
  const html = decodePage(pageUrl);

  assert.doesNotMatch(html, /const retryUrl = "https:\/\/example\.com\/<\/script>/);
  assert.match(html, /\\u003c\/script>/);
  assert.match(html, /&lt;ERR_FAILED&gt;/);
});

test('web panel host replaces main-frame network failures but ignores aborted navigations', async () => {
  const source = await readFile(join(testDir, '../WebPanelHost.ts'), 'utf8');
  const failureHandlerStart = source.indexOf("'did-fail-load'");
  const loadingHandlerStart = source.indexOf(
    "'did-start-loading'",
    failureHandlerStart
  );
  const failureHandler = source.slice(failureHandlerStart, loadingHandlerStart);

  assert.ok(failureHandlerStart >= 0);
  assert.match(failureHandler, /errorCode === -3 \|\| !isMainFrame/);
  assert.match(failureHandler, /this\.showNavigationFailure\(/);
  assert.match(source, /view\.webContents\.loadURL\(errorPageUrl\)/);
});

test('web panel host bounds hanging initial and subsequent main-frame loads', async () => {
  const source = await readFile(join(testDir, '../WebPanelHost.ts'), 'utf8');

  assert.match(source, /const NAVIGATION_TIMEOUT_MS = 15_000/);
  assert.match(source, /'did-start-navigation'/);
  assert.match(source, /!isMainFrame \|\| isInPlace \|\| url\.startsWith\('data:'\)/);
  assert.match(
    source,
    /this\.dependencies\.emitLoading\(\{ panelId, isLoading: true \}\);\s+this\.startNavigationTimeout/
  );
  assert.match(source, /this\.startNavigationTimeout\(panelId, view, url\)/);
  assert.match(source, /view\.webContents\.stop\(\)/);
  assert.match(source, /'ERR_CONNECTION_TIMED_OUT'/);
  assert.match(source, /this\.clearNavigationTimeout\(panelId\)/);

  const stopLoadingStart = source.indexOf("'did-stop-loading'");
  const zoomChangedStart = source.indexOf("'zoom-changed'", stopLoadingStart);
  const stopLoadingHandler = source.slice(stopLoadingStart, zoomChangedStart);
  assert.doesNotMatch(stopLoadingHandler, /clearNavigationTimeout/);
});

test('panel chrome cannot lose an initial loading terminal event while activating a panel', async () => {
  const source = await readFile(
    join(testDir, '../../../renderer/panel-chrome/App.tsx'),
    'utf8'
  );

  assert.match(source, /panelIdRef\.current = panelId/);
  assert.match(
    source,
    /activatePanelLoadingState\(payload\.panelId, false\)/
  );
  assert.match(
    source,
    /activatePanelLoadingState\(payload\.descriptor\.id, payload\.isLoading \?\? false\)/
  );
  assert.match(source, /if \(payload\.isLoading\) \{\s+setIsViewLoading\(true\)/);

  const css = await readFile(
    join(testDir, '../../../renderer/panel-chrome/panel.css'),
    'utf8'
  );
  assert.match(source, /className=\{`relative flex h-\[76px\]/);
  assert.match(css, /\.loading-bar \{\s+position: absolute;\s+left: 0;\s+bottom: 0;/);
  assert.match(css, /animation: loading-bar-indeterminate/);
});
