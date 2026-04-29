import type { AppearanceConfig } from './types';

export interface SurfaceColors {
  bg: string; // '#RRGGBBAA'
  fg: string; // '#RRGGBBAA'
}

export const THEME_PRESETS: Record<'dark' | 'light', SurfaceColors> = {
  dark: { bg: '#323232FF', fg: '#FFFFFFE6' },
  light: { bg: '#F3F3F3FF', fg: '#1B1B1BE6' }
};

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export const parseHex8 = (hex: string): RGBA => {
  const stripped = hex.replace(/^#/, '');
  const padded = stripped.length === 6 ? `${stripped}FF` : stripped;
  return {
    r: parseInt(padded.slice(0, 2), 16),
    g: parseInt(padded.slice(2, 4), 16),
    b: parseInt(padded.slice(4, 6), 16),
    a: parseInt(padded.slice(6, 8), 16)
  };
};

export const getReadableForeground = (hex8: string): string => {
  const { r, g, b, a } = parseHex8(hex8);
  // 透明背景按暗背景处理（白字优先），用户在暗桌面可读
  if (a < 128) {
    return '#FFFFFFE6';
  }
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 128 ? '#1B1B1BE6' : '#FFFFFFE6';
};

export const resolveSurfaceColors = (
  appearance: AppearanceConfig,
  nativeIsDark: boolean
): SurfaceColors => {
  if (appearance.themeMode === 'custom') {
    return {
      bg: appearance.customColor,
      fg: getReadableForeground(appearance.customColor)
    };
  }
  if (appearance.themeMode === 'system') {
    return nativeIsDark ? THEME_PRESETS.dark : THEME_PRESETS.light;
  }
  return THEME_PRESETS[appearance.themeMode];
};

export const needsTransparency = (appearance: AppearanceConfig): boolean => {
  if (appearance.themeMode !== 'custom') {
    return false;
  }
  const { a } = parseHex8(appearance.customColor);
  return a < 255;
};
