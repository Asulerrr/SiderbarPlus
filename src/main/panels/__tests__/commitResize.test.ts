import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampPanelWidth } from '../panelResize.ts';

test('clamps width to 25% of work area (min 360px)', () => {
  assert.equal(clampPanelWidth(100, 1920), 480);   // 25% of 1920 = 480
  assert.equal(clampPanelWidth(0, 1920), 480);
  assert.equal(clampPanelWidth(-50, 1920), 480);
  assert.equal(clampPanelWidth(100, 1280), 360);    // 25% of 1280 = 320 < 360 floor
});

test('clamps width to 80% of work area maximum', () => {
  assert.equal(clampPanelWidth(9999, 1920), 1536);
  assert.equal(clampPanelWidth(9999, 1366), 1093);
});

test('passes through valid widths', () => {
  assert.equal(clampPanelWidth(500, 1920), 500);
  assert.equal(clampPanelWidth(480, 1920), 480);
  assert.equal(clampPanelWidth(1536, 1920), 1536);
});

test('rounds fractional widths', () => {
  assert.equal(clampPanelWidth(500.6, 1920), 501);
});
