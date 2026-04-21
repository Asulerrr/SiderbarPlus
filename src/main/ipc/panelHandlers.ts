import { BrowserWindow, ipcMain } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { IpcResult, PanelDescriptor, PanelState } from '../../shared/types';
import type { ConfigStore } from '../store/ConfigStore';
import { logger } from '../utils/logger';
import type { WindowManager } from '../windows/WindowManager';

const emitPanelState = (state: PanelState): void => {
  for (const window of BrowserWindow.getAllWindows()) {
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

  ipcMain.handle(IPC_CHANNELS.panelsShow, async (_event, payload: { id: string }) => {
    try {
      const config = await configStore.read();
      const state: PanelState = {
        activePanelId: payload.id,
        pinned: config.layout.pinned,
        edge: config.layout.edge
      };

      windowManager.setActivePanelId(payload.id);
      emitPanelState(state);

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
      windowManager.setActivePanelId(null);

      emitPanelState({
        activePanelId: null,
        pinned: config.layout.pinned,
        edge: config.layout.edge
      });

      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('panels:hide failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown panel hide error'
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
        windowManager.setActivePanelId(null);
        emitPanelState({
          activePanelId: null,
          pinned: config.layout.pinned,
          edge: config.layout.edge
        });
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
