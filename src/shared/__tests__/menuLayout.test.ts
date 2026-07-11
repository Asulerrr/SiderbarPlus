import assert from 'node:assert/strict';
import test from 'node:test';

import {
  PANEL_MENU_ITEM_COUNT,
  PANEL_MENU_SEPARATOR_COUNT,
  getPanelMenuWindowSize
} from '../menuLayout.ts';

test('panel menu window is tall enough for all visible actions', () => {
  const size = getPanelMenuWindowSize({
    itemCount: PANEL_MENU_ITEM_COUNT,
    separatorCount: PANEL_MENU_SEPARATOR_COUNT
  });

  assert.equal(PANEL_MENU_ITEM_COUNT, 8);
  assert.equal(PANEL_MENU_SEPARATOR_COUNT, 1);
  assert.equal(size.height, 275);
});
