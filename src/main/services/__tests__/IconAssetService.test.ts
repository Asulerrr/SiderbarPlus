import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import { hydratePanelsForRenderer } from '../IconAssetService.ts';

const ONE_BY_ONE_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO2p+2QAAAAASUVORK5CYII=';

test('hydrates local icon paths into renderer-safe data URLs', async (t) => {
  const tempDir = await mkdtemp(join(tmpdir(), 'sidebar-icon-'));
  t.after(async () => {
    await rm(tempDir, { recursive: true, force: true });
  });

  const iconPath = join(tempDir, 'icon.png');
  await writeFile(iconPath, Buffer.from(ONE_BY_ONE_PNG_BASE64, 'base64'));

  const [panel] = await hydratePanelsForRenderer([
    {
      id: 'panel-local',
      type: 'web',
      title: 'Local icon',
      order: 0,
      preferredWidth: 456,
      iconSource: {
        kind: 'auto',
        path: iconPath,
        fallbackLetter: 'L',
        fallbackColor: '#375a7f'
      },
      web: {
        url: 'https://example.com',
        openInBrowser: 'system',
        zoomFactor: 1,
        userAgentMode: 'desktop',
        notificationsSnoozed: false
      }
    }
  ]);

  assert.equal(panel.iconSource.path, iconPath);
  assert.equal(panel.iconSource.dataUrl?.startsWith('data:image/png;base64,'), true);
});

test('leaves remote icon paths unchanged', async () => {
  const [panel] = await hydratePanelsForRenderer([
    {
      id: 'panel-remote',
      type: 'web',
      title: 'Remote icon',
      order: 0,
      preferredWidth: 456,
      iconSource: {
        kind: 'auto',
        path: 'https://example.com/icon.png',
        fallbackLetter: 'R',
        fallbackColor: '#375a7f'
      },
      web: {
        url: 'https://example.com',
        openInBrowser: 'system',
        zoomFactor: 1,
        userAgentMode: 'desktop',
        notificationsSnoozed: false
      }
    }
  ]);

  assert.equal(panel.iconSource.path, 'https://example.com/icon.png');
  assert.equal(panel.iconSource.dataUrl, undefined);
});

test('falls back to original icon source when local file is missing', async () => {
  const [panel] = await hydratePanelsForRenderer([
    {
      id: 'panel-missing',
      type: 'web',
      title: 'Missing icon',
      order: 0,
      preferredWidth: 456,
      iconSource: {
        kind: 'auto',
        path: 'C:\\missing\\icon.png',
        fallbackLetter: 'M',
        fallbackColor: '#375a7f'
      },
      web: {
        url: 'https://example.com',
        openInBrowser: 'system',
        zoomFactor: 1,
        userAgentMode: 'desktop',
        notificationsSnoozed: false
      }
    }
  ]);

  assert.equal(panel.iconSource.path, 'C:\\missing\\icon.png');
  assert.equal(panel.iconSource.dataUrl, undefined);
});
