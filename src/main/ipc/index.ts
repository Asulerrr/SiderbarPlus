import type { AutoLaunchService } from '../services/AutoLaunchService';
import type { FullscreenWatcher } from '../services/FullscreenWatcher';
import type { ConfigStore } from '../store/ConfigStore';
import type { TrayManager } from '../tray/TrayManager';
import type { WindowManager } from '../windows/WindowManager';
import { registerAppHandlers } from './appHandlers';
import { registerBrowserHandlers } from './browserHandlers';
import { registerConfigHandlers } from './configHandlers';
import { registerFaviconHandlers } from './faviconHandlers';
import { registerPanelHandlers } from './panelHandlers';
import { registerSettingsHandlers } from './settingsHandlers';

export const registerIpcHandlers = (
  configStore: ConfigStore,
  windowManager: WindowManager,
  trayManager: TrayManager,
  autoLaunchService: AutoLaunchService,
  fullscreenWatcher: FullscreenWatcher
): void => {
  registerConfigHandlers(configStore, autoLaunchService, fullscreenWatcher, windowManager);
  registerPanelHandlers(configStore, windowManager);
  registerAppHandlers(windowManager, trayManager, configStore, autoLaunchService);
  registerBrowserHandlers();
  registerFaviconHandlers();
  registerSettingsHandlers(configStore, windowManager);
};
