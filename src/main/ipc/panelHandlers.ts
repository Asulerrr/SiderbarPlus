import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { IpcResult, PanelDescriptor, PanelState } from '../../shared/types';
import type { ConfigStore } from '../store/ConfigStore';
import { logger } from '../utils/logger';
import type { WindowManager } from '../windows/WindowManager';

const emitPanelState = (state: PanelState): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.getTitle() === 'SideBar Plus Panel Animation') {
      continue;
    }

    window.webContents.send(IPC_CHANNELS.panelState, state);
  }
};

export const registerPanelHandlers = (
  configStore: ConfigStore,
  windowManager: WindowManager
): void => {
  ipcMain.handle(IPC_CHANNELS.panelsList, async (): Promise<IpcResult<PanelDescriptor[]>> => {
    try {
      const config = await configStore.read();
      return {
        ok: true,
        data: [...config.panels].sort((left, right) => left.order - right.order)
      };
    } catch (error) {
      logger.error('panels:list failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown panel list error'
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.panelsHover, async (_event, payload: { id: string }) => {
    try {
      await windowManager.hoverPanel(payload.id);
      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('panels:hover failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown panel hover error'
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.panelsShow, async (_event, payload: { id: string }) => {
    try {
      const config = await configStore.read();
      await windowManager.showPanel(payload.id, true);

      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('panels:show failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown panel show error'
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.panelsHide, async (): Promise<IpcResult<void>> => {
    try {
      const config = await configStore.read();
      await windowManager.hidePanel(false);

      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('panels:hide failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown panel hide error'
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.panelsScheduleHide, async (): Promise<IpcResult<void>> => {
    try {
      windowManager.scheduleHidePanel(false);
      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('panels:schedule-hide failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown panel schedule hide error'
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.panelsCancelHide, async (): Promise<IpcResult<void>> => {
    try {
      windowManager.cancelScheduledHide();
      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('panels:cancel-hide failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown panel cancel hide error'
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.panelsMinimize, async (): Promise<IpcResult<void>> => {
    try {
      await windowManager.hidePanel(false);
      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('panels:minimize failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown panel minimize error'
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.panelsClose, async (): Promise<IpcResult<void>> => {
    try {
      await windowManager.hidePanel(true);
      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('panels:close failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown panel close error'
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.panelsMarkSticky, async (): Promise<IpcResult<void>> => {
    try {
      windowManager.markPanelSticky();
      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('panels:mark-sticky failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown panel sticky error'
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.panelsRemove, async (_event, payload: { id: string }) => {
    try {
      const config = await configStore.read();
      const nextPanels = config.panels
        .filter((panel) => panel.id !== payload.id)
        .map((panel, index) => ({
          ...panel,
          order: index
        }));

      await configStore.update({ panels: nextPanels });

      if (windowManager.getActivePanelId() === payload.id) {
        await windowManager.hidePanel(true);
      }

      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('panels:remove failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown panel remove error'
      };
    }
  });
};
