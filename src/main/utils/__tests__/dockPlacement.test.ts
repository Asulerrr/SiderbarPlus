import assert from 'node:assert/strict';
import test from 'node:test';

import { didDockPlacementChange } from '../dockPlacement.ts';

test('treats simultaneous edge and display changes as one placement change', () => {
  assert.equal(
    didDockPlacementChange(
      { edge: 'left', displayId: 1 },
      { edge: 'right', displayId: 2 }
    ),
    true
  );
});

test('ignores layout changes that do not affect Dock placement', () => {
  assert.equal(
    didDockPlacementChange(
      { edge: 'right', displayId: 2 },
      { edge: 'right', displayId: 2 }
    ),
    false
  );
});
