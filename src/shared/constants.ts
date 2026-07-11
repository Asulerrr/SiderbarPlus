import type { AppConfig } from './types';
import { DEFAULT_ICONS } from './defaultIcons.ts';

export const APP_ID = 'com.sidebar.app';
export const APP_NAME = 'SideBar';
export const DOCK_WIDTH = 44;
export const PANEL_INITIAL_WIDTH_PERCENT = 25;
export const PANEL_DEFAULT_WIDTH = 50; // Maximum width as a percentage of the work area.
export const DOCK_BACKGROUND = '#323232';
export const DOCK_DEFAULT_OPACITY = 30;
export const BUILTIN_ADD_SITE_ID = 'builtin:add-site';
export const BUILTIN_SETTINGS_ID = 'builtin:settings';
export const BUILTIN_EDIT_SITE_PREFIX = 'builtin:edit-site:';
export const BUILTIN_SITE_INFO_PREFIX = 'builtin:site-info:';

const DEFAULT_PANELS = [
  {
    id: 'dev-bilibili',
    title: '哔哩哔哩',
    url: 'https://www.bilibili.com',
    fallbackLetter: '哔',
    fallbackColor: '#FB7299'
  },
  {
    id: 'dev-xiaohongshu',
    title: '小红书',
    url: 'https://www.xiaohongshu.com',
    fallbackLetter: '红',
    fallbackColor: '#FE2C55'
  },
  {
    id: 'dev-doubao',
    title: '豆包',
    url: 'https://www.doubao.com',
    fallbackLetter: '豆',
    fallbackColor: '#0052FF'
  },
  {
    id: 'dev-claude',
    title: 'Claude',
    url: 'https://claude.ai',
    fallbackLetter: 'C',
    fallbackColor: '#D97706'
  },
  {
    id: 'dev-google',
    title: 'Google',
    url: 'https://www.google.com',
    fallbackLetter: 'G',
    fallbackColor: '#4285F4'
  }
] as const;

const buildDefaultPanels = () =>
  DEFAULT_PANELS.map((panel, order) => ({
    id: panel.id,
    type: 'web' as const,
    title: panel.title,
    iconSource: {
      kind: 'auto' as const,
      dataUrl: DEFAULT_ICONS[panel.id],
      fallbackLetter: panel.fallbackLetter,
      fallbackColor: panel.fallbackColor
    },
    order,
    preferredWidth: PANEL_INITIAL_WIDTH_PERCENT,
    web: {
      url: panel.url,
      openInBrowser: 'system',
      zoomFactor: 1,
      userAgentMode: 'desktop' as const,
      notificationsSnoozed: false,
      isolatedSession: false
    }
  }));

export const DEFAULT_CONFIG = (): AppConfig => {
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    app: {
      autoLaunch: false,
      autoShowDock: true,
      hideOnFullscreen: true
    },
    layout: {
      edge: 'right',
      panelDefaultWidth: PANEL_DEFAULT_WIDTH
    },
    behavior: {
      hoverOpenDelayMs: 200,
      hoverCloseDelayMs: 300,
      keepAudioOnHide: true
    },
    appearance: {
      themeMode: 'transparent',
      customColor: '#1B1B1BFF',
      dockOpacity: DOCK_DEFAULT_OPACITY
    },
    panels: buildDefaultPanels(),
    meta: {
      createdAt: now,
      lastUpdatedAt: now
    }
  };
};
