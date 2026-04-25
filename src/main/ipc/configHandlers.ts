import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { AppConfig, IpcResult } from '../../shared/types';
import { logger } from '../utils/logger';
import type { ConfigStore } from '../store/ConfigStore';
import type { AutoLaunchService } from '../services/AutoLaunchService';
import type { FullscreenWatcher } from '../services/FullscreenWatcher';
import type { WindowManager } from '../windows/WindowManager';

export const registerConfigHandlers = (
  configStore: ConfigStore,
  autoLaunchService: AutoLaunchService,
  fullscreenWatcher: FullscreenWatcher,
  windowManager: WindowManager
): void => {
  ipcMain.handle(IPC_CHANNELS.configRead, async (): Promise<IpcResult<AppConfig>> => {
    try {
      const config = await configStore.read();
      return { ok: true, data: config };
    } catch (error) {
      logger.error('config:read failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown config read error'
      };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.configUpdate,
    async (_event, patch: Partial<AppConfig>): Promise<IpcResult<AppConfig>> => {
      try {
        const before = await configStore.read();
        const config = await configStore.update(patch);
        // autoLaunch 变化时同步注册表（PRD §5.9.1）
        if (before.app.autoLaunch !== config.app.autoLaunch) {
          await autoLaunchService.sync(config.app.autoLaunch);
        }
        // layout.edge 变化时强制收起 panel + 重定位窗口（PRD §5.8）
        if (before.layout.edge !== config.layout.edge) {
          windowManager.applyEdgeChange(config);
        }
        // hideOnFullscreen 变化时启停 watcher（PRD §5.9.4）
        if (before.app.hideOnFullscreen !== config.app.hideOnFullscreen) {
          if (config.app.hideOnFullscreen) {
            fullscreenWatcher.start();
          } else {
            fullscreenWatcher.stop();
          }
        }
        return { ok: true, data: config };
      } catch (error) {
        logger.error('config:update failed', error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown config update error'
        };
      }
    }
  );
};
