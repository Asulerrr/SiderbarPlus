import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../constants.ts';

describe('DEFAULT_CONFIG', () => {
  it('includes appearance with system theme and dark default custom color', () => {
    const config = DEFAULT_CONFIG();
    assert.equal(config.appearance.themeMode, 'system');
    assert.equal(config.appearance.customColor, '#1B1B1BFF');
  });
});
