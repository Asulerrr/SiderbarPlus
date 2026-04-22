import assert from 'node:assert/strict';
import test from 'node:test';

import { getDockActiveIndicatorSide, shouldShowDockActiveIndicator } from '../dockLayout.ts';

test('active dock indicator stays on the outer screen edge', () => {
  assert.equal(getDockActiveIndicatorSide('right'), 'right');
  assert.equal(getDockActiveIndicatorSide('left'), 'left');
});

test('active dock indicator is hidden when the panel is not visible', () => {
  assert.equal(
    shouldShowDockActiveIndicator({ activePanelId: 'panel-a', panelVisible: false }),
    false
  );
  assert.equal(
    shouldShowDockActiveIndicator({ activePanelId: null, panelVisible: true }),
    false
  );
  assert.equal(
    shouldShowDockActiveIndicator({ activePanelId: 'panel-a', panelVisible: true }),
    true
  );
});
