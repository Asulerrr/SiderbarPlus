import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { AppConfig, IpcResult } from '../../shared/types';
import { logger } from '../utils/logger';
import type { ConfigStore } from '../store/ConfigStore';

export const registerConfigHandlers = (configStore: ConfigStore): void => {
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
        const config = await configStore.update(patch);
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
