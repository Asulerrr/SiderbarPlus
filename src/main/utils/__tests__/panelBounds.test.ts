import assert from 'node:assert/strict';
import test from 'node:test';

import { getPanelBounds, getPreferredPanelWidth } from '../panelBounds.ts';

test('uses descriptor preferred width when calculating panel bounds on the right edge', () => {
  const bounds = getPanelBounds(
    'right',
    {
      x: 1000,
      y: 40,
      width: 44,
      height: 900
    },
    520
  );

  assert.deepEqual(bounds, {
    x: 480,
    y: 40,
    width: 520,
    height: 900
  });
});

test('uses descriptor preferred width when calculating panel bounds on the left edge', () => {
  const bounds = getPanelBounds(
    'left',
    {
      x: 0,
      y: 0,
      width: 44,
      height: 900
    },
    380
  );

  assert.deepEqual(bounds, {
    x: 44,
    y: 0,
    width: 380,
    height: 900
  });
});

test('falls back to the global default width when descriptor width is missing or invalid', () => {
  assert.equal(getPreferredPanelWidth(undefined, 456), 456);
  assert.equal(getPreferredPanelWidth(0, 456), 456);
  assert.equal(getPreferredPanelWidth(Number.NaN, 456), 456);
});

test('rounds descriptor width to an integer before use', () => {
  assert.equal(getPreferredPanelWidth(512.7, 456), 513);
});
