import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampPanelWidth } from '../panelResize.ts';

test('clamps width to 320 minimum', () => {
  assert.equal(clampPanelWidth(100, 1920), 320);
  assert.equal(clampPanelWidth(0, 1920), 320);
  assert.equal(clampPanelWidth(-50, 1920), 320);
});

test('clamps width to half of work area maximum', () => {
  assert.equal(clampPanelWidth(9999, 1920), 960);
  assert.equal(clampPanelWidth(9999, 1366), 683);
});

test('passes through valid widths', () => {
  assert.equal(clampPanelWidth(500, 1920), 500);
  assert.equal(clampPanelWidth(320, 1920), 320);
  assert.equal(clampPanelWidth(960, 1920), 960);
});

test('rounds fractional widths', () => {
  assert.equal(clampPanelWidth(500.6, 1920), 501);
});
