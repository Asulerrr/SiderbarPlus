import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { FaviconFetchPayload, FaviconFetchResult, IpcResult } from '../../shared/types';
import { FaviconService } from '../services/FaviconService';
import { handleIpc } from './handleIpc';

export const registerFaviconHandlers = (): void => {
  const faviconService = new FaviconService();

  handleIpc(
    IPC_CHANNELS.faviconFetch,
    async (_event, payload: FaviconFetchPayload): Promise<IpcResult<FaviconFetchResult>> => {
      const favicon = await faviconService.fetch(payload.url);
      return { ok: true, data: favicon };
    }
  );
};
