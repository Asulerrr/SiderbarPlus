import assert from 'node:assert/strict';
import test from 'node:test';
import { isPointInResizeIntentCorridor } from '../resizeIntent.ts';

const bounds = { x: 500, y: 100, width: 400, height: 700 };

test('protects only the resizable edge of a right-side panel', () => {
  assert.equal(
    isPointInResizeIntentCorridor({ x: 486, y: 400 }, bounds, 'right', 14),
    true
  );
  assert.equal(
    isPointInResizeIntentCorridor({ x: 515, y: 400 }, bounds, 'right', 14),
    false
  );
  assert.equal(
    isPointInResizeIntentCorridor({ x: 900, y: 400 }, bounds, 'right', 14),
    false
  );
});

test('protects only the resizable edge of a left-side panel', () => {
  assert.equal(
    isPointInResizeIntentCorridor({ x: 914, y: 400 }, bounds, 'left', 14),
    true
  );
  assert.equal(
    isPointInResizeIntentCorridor({ x: 885, y: 400 }, bounds, 'left', 14),
    false
  );
  assert.equal(
    isPointInResizeIntentCorridor({ x: 500, y: 400 }, bounds, 'left', 14),
    false
  );
});

test('includes a small vertical tolerance but not unrelated screen areas', () => {
  assert.equal(
    isPointInResizeIntentCorridor({ x: 500, y: 86 }, bounds, 'right', 14),
    true
  );
  assert.equal(
    isPointInResizeIntentCorridor({ x: 500, y: 85 }, bounds, 'right', 14),
    false
  );
  assert.equal(
    isPointInResizeIntentCorridor({ x: 500, y: 815 }, bounds, 'right', 14),
    false
  );
});
