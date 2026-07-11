import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampPanelWidth, getPanelWidthRange, getRightAnchoredViewX } from '../panelResize.ts';

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

test('returns native resize limits with a valid min/max order', () => {
  assert.deepEqual(getPanelWidthRange(1920, 80), { min: 480, max: 1536 });
  assert.deepEqual(getPanelWidthRange(1280, 25), { min: 320, max: 320 });
});

test('right anchor is derived from absolute geometry, not prior resize events', () => {
  assert.equal(getRightAnchoredViewX(509, 460), 49);
  assert.equal(getRightAnchoredViewX(549, 460), 89);
  assert.equal(getRightAnchoredViewX(549, 500), 49);
});
