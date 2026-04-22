import assert from 'node:assert/strict';
import test from 'node:test';

import { IPC_CHANNELS } from '../ipc-contracts.ts';

test('dock exposes a native context menu channel for panel actions', () => {
  assert.equal(IPC_CHANNELS.panelsContextMenu, 'panels:context-menu');
});
