import type { AppConfig } from './types';

export const APP_ID = 'com.sidebarplus.app';
export const APP_NAME = 'SideBar Plus';
export const APP_VERSION = '1.0.0';
export const DOCK_WIDTH = 44;
export const PANEL_DEFAULT_WIDTH = 456;
export const DOCK_BACKGROUND = '#1F1F1F';
export const BUILTIN_ADD_SITE_ID = 'builtin:add-site';
export const BUILTIN_SETTINGS_ID = 'builtin:settings';

export const DEFAULT_CONFIG = (): AppConfig => {
  const now = new Date().toISOString();

  return {
    schemaVersion: 1,
    app: {
      autoLaunch: true,
      autoShowDock: true,
      hideOnFullscreen: true
    },
    layout: {
      edge: 'right',
      panelDefaultWidth: PANEL_DEFAULT_WIDTH,
      pinned: false
    },
    behavior: {
      hoverOpenDelayMs: 200,
      hoverCloseDelayMs: 300,
      keepAudioOnHide: true
    },
    panels: [],
    meta: {
      createdAt: now,
      lastUpdatedAt: now
    }
  };
};
