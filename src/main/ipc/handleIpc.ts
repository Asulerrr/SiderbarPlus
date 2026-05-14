import { ipcMain } from 'electron';
import type { IpcResult } from '../../shared/types';
import { logger } from '../utils/logger';

type IpcHandler<TArgs extends unknown[], TResult> = (
  event: Electron.IpcMainInvokeEvent,
  ...args: TArgs
) => Promise<TResult>;

export function handleIpc<TResult>(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent) => Promise<TResult>
): void;
export function handleIpc<TArg, TResult>(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, arg: TArg) => Promise<TResult>
): void;
export function handleIpc(
  channel: string,
  handler: IpcHandler<unknown[], unknown>
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (error) {
      logger.error(`${channel} failed`, error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : `Unknown ${channel} error`
      } satisfies IpcResult<never>;
    }
  });
}
