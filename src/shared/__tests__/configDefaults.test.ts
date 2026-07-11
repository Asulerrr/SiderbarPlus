import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG, PANEL_DEFAULT_WIDTH } from '../constants.ts';

describe('DEFAULT_CONFIG', () => {
  it('includes appearance with transparent theme and dark default custom color', () => {
    const config = DEFAULT_CONFIG();
    assert.equal(config.appearance.themeMode, 'transparent');
    assert.equal(config.appearance.customColor, '#1B1B1BFF');
  });

  it('includes locally-iconed starter sites for a fresh install', () => {
    const config = DEFAULT_CONFIG();

    assert.deepEqual(
      config.panels.map(
        ({ id, title, order, preferredWidth, web, iconSource }) => ({
          id,
          title,
          order,
          preferredWidth,
          url: web?.url,
          iconKind: iconSource.kind,
          hasLocalIcon: iconSource.dataUrl?.startsWith('data:image/')
        })
      ),
      [
        {
          id: 'dev-bilibili',
          title: '哔哩哔哩',
          order: 0,
          preferredWidth: PANEL_DEFAULT_WIDTH,
          url: 'https://www.bilibili.com',
          iconKind: 'auto',
          hasLocalIcon: true
        },
        {
          id: 'dev-xiaohongshu',
          title: '小红书',
          order: 1,
          preferredWidth: PANEL_DEFAULT_WIDTH,
          url: 'https://www.xiaohongshu.com',
          iconKind: 'auto',
          hasLocalIcon: true
        },
        {
          id: 'dev-doubao',
          title: '豆包',
          order: 2,
          preferredWidth: PANEL_DEFAULT_WIDTH,
          url: 'https://www.doubao.com',
          iconKind: 'auto',
          hasLocalIcon: true
        },
        {
          id: 'dev-claude',
          title: 'Claude',
          order: 3,
          preferredWidth: PANEL_DEFAULT_WIDTH,
          url: 'https://claude.ai',
          iconKind: 'auto',
          hasLocalIcon: true
        },
        {
          id: 'dev-google',
          title: 'Google',
          order: 4,
          preferredWidth: PANEL_DEFAULT_WIDTH,
          url: 'https://www.google.com',
          iconKind: 'auto',
          hasLocalIcon: true
        }
      ]
    );
  });

  it('returns independent panel data for each config', () => {
    const first = DEFAULT_CONFIG();
    const second = DEFAULT_CONFIG();

    assert.notStrictEqual(first.panels, second.panels);
    assert.notStrictEqual(first.panels[0], second.panels[0]);
    assert.notStrictEqual(
      first.panels[0].iconSource,
      second.panels[0].iconSource
    );
    assert.notStrictEqual(first.panels[0].web, second.panels[0].web);
  });
});
