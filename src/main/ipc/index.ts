import type { ConfigStore } from '../store/ConfigStore';
import type { TrayManager } from '../tray/TrayManager';
import type { WindowManager } from '../windows/WindowManager';
import { registerAppHandlers } from './appHandlers';
import { registerConfigHandlers } from './configHandlers';
import { registerPanelHandlers } from './panelHandlers';

export const registerIpcHandlers = (
  configStore: ConfigStore,
  windowManager: WindowManager,
  trayManager: TrayManager
): void => {
  registerConfigHandlers(configStore);
  registerPanelHandlers(configStore, windowManager);
  registerAppHandlers(windowManager, trayManager);
};
