import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { BrowserInfo, IpcResult } from '../../shared/types';
import { BrowserService } from '../services/BrowserService';
import { logger } from '../utils/logger';

export const registerBrowserHandlers = (): void => {
  const browserService = new BrowserService();

  ipcMain.handle(IPC_CHANNELS.browsersList, async (): Promise<IpcResult<BrowserInfo[]>> => {
    try {
      const browsers = await browserService.listBrowsers();
      return {
        ok: true,
        data: browsers
      };
    } catch (error) {
      logger.error('browsers:list failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown browser list error'
      };
    }
  });
};
