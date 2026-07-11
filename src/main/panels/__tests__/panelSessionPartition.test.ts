import assert from 'node:assert/strict';
import test from 'node:test';
import type { PanelDescriptor } from '../../../shared/types';
import { resolvePanelPartition } from '../panelSessionPartition.ts';

const descriptor = (id: string, sessionGroup?: string): PanelDescriptor => ({
  id,
  type: 'web',
  title: id,
  iconSource: { kind: 'letter' },
  order: 0,
  preferredWidth: 50,
  web: {
    url: 'https://example.com',
    openInBrowser: 'system',
    zoomFactor: 1,
    userAgentMode: 'desktop',
    sessionGroup
  }
});

test('resolves shared, grouped and isolated panel partitions', () => {
  assert.equal(resolvePanelPartition(descriptor('shared')), 'persist:shared');
  assert.equal(resolvePanelPartition(descriptor('work', 'team')), 'persist:group-team');
  assert.equal(resolvePanelPartition(descriptor('private', '__isolated__')), 'persist:panel-private');
});
