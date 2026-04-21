import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { IpcResult } from '../../shared/types';
import type { TrayManager } from '../tray/TrayManager';
import { logger } from '../utils/logger';
import type { WindowManager } from '../windows/WindowManager';

export const registerAppHandlers = (
  windowManager: WindowManager,
  trayManager: TrayManager
): void => {
  ipcMain.handle(IPC_CHANNELS.appHideToTray, async (): Promise<IpcResult<void>> => {
    try {
      windowManager.hideDockToTray();
      trayManager.refreshMenu();
      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('app:hide-to-tray failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown hide-to-tray error'
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.appToggleDockVisibility, async (): Promise<IpcResult<boolean>> => {
    try {
      const isVisible = windowManager.toggleDockVisibility();
      trayManager.refreshMenu();
      return { ok: true, data: isVisible };
    } catch (error) {
      logger.error('app:toggle-dock-visibility failed', error);
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Unknown dock visibility toggle error'
      };
    }
  });
};
