import assert from 'node:assert/strict';
import test from 'node:test';

import { toRenderableIconUrl } from '../iconUrl.ts';

test('converts Windows icon paths with spaces to encoded file URLs', () => {
  const iconPath =
    'C:\\Users\\Arun\\AppData\\Roaming\\SideBar Plus\\cache\\favicons\\www.doubao.com-2c48f218590d.png';

  assert.equal(
    toRenderableIconUrl(iconPath),
    'file:///C:/Users/Arun/AppData/Roaming/SideBar%20Plus/cache/favicons/www.doubao.com-2c48f218590d.png'
  );
});

test('keeps existing icon URLs unchanged', () => {
  assert.equal(toRenderableIconUrl('https://example.com/icon.png'), 'https://example.com/icon.png');
  assert.equal(toRenderableIconUrl('data:image/png;base64,abc'), 'data:image/png;base64,abc');
  assert.equal(toRenderableIconUrl('file:///C:/icons/icon.png'), 'file:///C:/icons/icon.png');
});
