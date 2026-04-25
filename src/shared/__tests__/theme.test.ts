import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  THEME_PRESETS,
  getReadableForeground,
  parseHex8,
  resolveSurfaceColors,
  needsTransparency
} from '../theme.ts';

describe('parseHex8', () => {
  it('parses #RRGGBBAA', () => {
    assert.deepEqual(parseHex8('#1B1B1BFF'), { r: 27, g: 27, b: 27, a: 255 });
  });
  it('parses #RRGGBB as alpha 255', () => {
    assert.deepEqual(parseHex8('#FFFFFF'), { r: 255, g: 255, b: 255, a: 255 });
  });
});

describe('getReadableForeground', () => {
  it('returns dark fg for light bg', () => {
    assert.equal(getReadableForeground('#FFFFFFFF'), '#1B1B1BE6');
  });
  it('returns light fg for dark bg', () => {
    assert.equal(getReadableForeground('#1B1B1BFF'), '#FFFFFFE6');
  });
  it('treats transparent bg as dark (returns light fg)', () => {
    assert.equal(getReadableForeground('#00000000'), '#FFFFFFE6');
  });
});

describe('resolveSurfaceColors', () => {
  it('returns dark preset for dark mode', () => {
    const colors = resolveSurfaceColors({ themeMode: 'dark', customColor: '#000000FF' }, false);
    assert.equal(colors.bg, THEME_PRESETS.dark.bg);
    assert.equal(colors.fg, THEME_PRESETS.dark.fg);
  });
  it('returns light preset for light mode', () => {
    const colors = resolveSurfaceColors({ themeMode: 'light', customColor: '#000000FF' }, true);
    assert.equal(colors.bg, THEME_PRESETS.light.bg);
  });
  it('follows nativeIsDark for system mode', () => {
    const dark = resolveSurfaceColors({ themeMode: 'system', customColor: '#000000FF' }, true);
    const light = resolveSurfaceColors({ themeMode: 'system', customColor: '#000000FF' }, false);
    assert.equal(dark.bg, THEME_PRESETS.dark.bg);
    assert.equal(light.bg, THEME_PRESETS.light.bg);
  });
  it('uses customColor for custom mode', () => {
    const colors = resolveSurfaceColors({ themeMode: 'custom', customColor: '#80FF00CC' }, false);
    assert.equal(colors.bg, '#80FF00CC');
    assert.equal(colors.fg, '#1B1B1BE6'); // bright green → dark fg
  });
});

describe('needsTransparency', () => {
  it('returns false for non-custom modes', () => {
    assert.equal(needsTransparency({ themeMode: 'dark', customColor: '#00000000' }), false);
    assert.equal(needsTransparency({ themeMode: 'system', customColor: '#00000000' }), false);
  });
  it('returns false for fully opaque custom color', () => {
    assert.equal(needsTransparency({ themeMode: 'custom', customColor: '#1B1B1BFF' }), false);
  });
  it('returns true for transparent custom color', () => {
    assert.equal(needsTransparency({ themeMode: 'custom', customColor: '#1B1B1B80' }), true);
  });
});
