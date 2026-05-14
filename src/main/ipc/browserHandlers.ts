import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { BrowserInfo, IpcResult } from '../../shared/types';
import { BrowserService } from '../services/BrowserService';
import { handleIpc } from './handleIpc';

export const registerBrowserHandlers = (): void => {
  const browserService = new BrowserService();

  handleIpc(IPC_CHANNELS.browsersList, async (): Promise<IpcResult<BrowserInfo[]>> => {
    const browsers = await browserService.listBrowsers();
    return { ok: true, data: browsers };
  });
};
