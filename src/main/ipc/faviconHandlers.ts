import { ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { FaviconFetchPayload, FaviconFetchResult, IpcResult } from '../../shared/types';
import { FaviconService } from '../services/FaviconService';
import { logger } from '../utils/logger';

export const registerFaviconHandlers = (): void => {
  const faviconService = new FaviconService();

  ipcMain.handle(
    IPC_CHANNELS.faviconFetch,
    async (_event, payload: FaviconFetchPayload): Promise<IpcResult<FaviconFetchResult>> => {
      try {
        const favicon = await faviconService.fetch(payload.url);
        return {
          ok: true,
          data: favicon
        };
      } catch (error) {
        logger.error('favicon:fetch failed', error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown favicon fetch error'
        };
      }
    }
  );
};
