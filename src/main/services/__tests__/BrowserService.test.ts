import assert from 'node:assert/strict';
import test from 'node:test';

import { matchBrowserCandidate } from '../BrowserService.ts';

test('matches browsers by normalized id', () => {
  const browser = matchBrowserCandidate('chrome');

  assert.equal(browser?.id, 'chrome');
  assert.equal(browser?.name, 'Google Chrome');
});

test('matches browsers by legacy executable path', () => {
  const browser = matchBrowserCandidate(
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'
  );

  assert.equal(browser?.id, 'msedge');
  assert.equal(browser?.name, 'Microsoft Edge');
});

test('returns null for unknown browser selections', () => {
  assert.equal(matchBrowserCandidate('unknown-browser'), null);
});
