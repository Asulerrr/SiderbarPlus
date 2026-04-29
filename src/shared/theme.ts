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
  nativeIsDark: boolean,
  applyDockOpacity = false
): SurfaceColors => {
  let result: SurfaceColors;
  if (appearance.themeMode === 'custom') {
    result = {
      bg: appearance.customColor,
      fg: getReadableForeground(appearance.customColor)
    };
  } else if (appearance.themeMode === 'transparent') {
    result = { ...THEME_PRESETS.dark };
  } else if (appearance.themeMode === 'system') {
    result = nativeIsDark ? { ...THEME_PRESETS.dark } : { ...THEME_PRESETS.light };
  } else {
    result = { ...THEME_PRESETS[appearance.themeMode] };
  }
  if (applyDockOpacity && appearance.themeMode === 'transparent') {
    return applyOpacity(result, appearance.dockOpacity);
  }
  return result;
};

/** 对 SurfaceColors.bg 的 alpha 通道按百分比缩放（0-100） */
export const applyOpacity = (surface: SurfaceColors, percent: number): SurfaceColors => {
  if (percent >= 100) return surface;
  const { r, g, b } = parseHex8(surface.bg);
  const a = Math.round((255 * percent) / 100);
  const aa = a.toString(16).padStart(2, '0');
  return {
    bg: `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}${aa}`,
    fg: surface.fg
  };
};

export const needsTransparency = (appearance: AppearanceConfig): boolean => {
  return appearance.themeMode === 'transparent' && appearance.dockOpacity < 100;
};
