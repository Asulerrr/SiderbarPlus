import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropLegacyPinned } from '../dropLegacyPinned.ts';

test('removes legacy layout.pinned field', () => {
  const input = {
    schemaVersion: 1,
    layout: { edge: 'right', panelDefaultWidth: 456, pinned: true }
  } as any;
  const output = dropLegacyPinned(input);
  assert.equal('pinned' in output.layout, false);
  assert.equal(output.layout.edge, 'right');
  assert.equal(output.layout.panelDefaultWidth, 456);
});

test('leaves config without layout.pinned untouched', () => {
  const input = {
    schemaVersion: 1,
    layout: { edge: 'left', panelDefaultWidth: 500 }
  } as any;
  const output = dropLegacyPinned(input);
  assert.equal(output.layout.edge, 'left');
  assert.equal(output.layout.panelDefaultWidth, 500);
});
