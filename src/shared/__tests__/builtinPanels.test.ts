import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBuiltinPanelId,
  parseBuiltinPanelId
} from '../builtinPanels.ts';

test('builds and parses add-site builtin panel ids', () => {
  const panelId = buildBuiltinPanelId('add-site');

  assert.equal(panelId, 'builtin:add-site');
  assert.deepEqual(parseBuiltinPanelId(panelId), {
    widgetId: 'add-site'
  });
});

test('builds and parses target-backed builtin panel ids', () => {
  const editPanelId = buildBuiltinPanelId('edit-site', 'panel-123');
  const siteInfoPanelId = buildBuiltinPanelId('site-info', 'panel-123');

  assert.equal(editPanelId, 'builtin:edit-site:panel-123');
  assert.equal(siteInfoPanelId, 'builtin:site-info:panel-123');
  assert.deepEqual(parseBuiltinPanelId(editPanelId), {
    widgetId: 'edit-site',
    targetPanelId: 'panel-123'
  });
  assert.deepEqual(parseBuiltinPanelId(siteInfoPanelId), {
    widgetId: 'site-info',
    targetPanelId: 'panel-123'
  });
});

test('returns null for invalid builtin panel ids', () => {
  assert.equal(parseBuiltinPanelId('github'), null);
  assert.equal(parseBuiltinPanelId('builtin:edit-site'), null);
  assert.equal(parseBuiltinPanelId('builtin:unknown:panel-123'), null);
});
