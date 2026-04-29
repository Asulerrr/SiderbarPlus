import type { AppConfig } from './types';

export const APP_ID = 'com.sidebarplus.app';
export const APP_NAME = 'SideBar Plus';
export const APP_VERSION = '1.0.0';
export const DOCK_WIDTH = 44;
export const PANEL_DEFAULT_WIDTH = 50; // 屏幕宽度的百分比（30-100）
export const DOCK_BACKGROUND = '#323232';
export const DOCK_DEFAULT_OPACITY = 100;
export const BUILTIN_ADD_SITE_ID = 'builtin:add-site';
export const BUILTIN_SETTINGS_ID = 'builtin:settings';
export const BUILTIN_EDIT_SITE_PREFIX = 'builtin:edit-site:';
export const BUILTIN_SITE_INFO_PREFIX = 'builtin:site-info:';

const DEV_TEST_PANELS = [
  {
    id: 'dev-github',
    title: 'GitHub',
    url: 'https://github.com',
    fallbackLetter: 'G',
    fallbackColor: '#24292f'
  },
  {
    id: 'dev-youtube',
    title: 'YouTube',
    url: 'https://www.youtube.com',
    fallbackLetter: 'Y',
    fallbackColor: '#ff0033'
  },
  {
    id: 'dev-bilibili',
    title: 'Bilibili',
    url: 'https://www.bilibili.com',
    fallbackLetter: 'B',
    fallbackColor: '#00a1d6'
  },
  {
    id: 'dev-x',
    title: 'X',
    url: 'https://x.com',
    fallbackLetter: 'X',
    fallbackColor: '#111111'
  },
  {
    id: 'dev-reddit',
    title: 'Reddit',
    url: 'https://www.reddit.com',
    fallbackLetter: 'R',
    fallbackColor: '#ff4500'
  },
  {
    id: 'dev-figma',
    title: 'Figma',
    url: 'https://www.figma.com',
    fallbackLetter: 'F',
    fallbackColor: '#a259ff'
  },
  {
    id: 'dev-notion',
    title: 'Notion',
    url: 'https://www.notion.so',
    fallbackLetter: 'N',
    fallbackColor: '#2f3437'
  },
  {
    id: 'dev-gmail',
    title: 'Gmail',
    url: 'https://mail.google.com',
    fallbackLetter: 'M',
    fallbackColor: '#ea4335'
  }
] as const;

const buildDevTestPanels = () =>
  DEV_TEST_PANELS.map((panel, index) => ({
    id: panel.id,
    type: 'web' as const,
    title: panel.title,
    iconSource: {
      kind: 'letter' as const,
      fallbackLetter: panel.fallbackLetter,
      fallbackColor: panel.fallbackColor
    },
    order: index,
    preferredWidth: PANEL_DEFAULT_WIDTH,
    web: {
      url: panel.url,
      openInBrowser: 'system',
      zoomFactor: 1,
      userAgentMode: 'desktop' as const,
      notificationsSnoozed: false
    }
  }));

export const DEFAULT_CONFIG = (): AppConfig => {
  const now = new Date().toISOString();
  const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);

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
      themeMode: 'system',
      customColor: '#1B1B1BFF',
      dockOpacity: DOCK_DEFAULT_OPACITY
    },
    panels: isDev ? buildDevTestPanels() : [],
    meta: {
      createdAt: now,
      lastUpdatedAt: now
    }
  };
};
