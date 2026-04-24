import { BrowserWindow, Menu, dialog, ipcMain } from 'electron';
import { copyFile, mkdir } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { nanoid } from 'nanoid';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type {
  IpcResult,
  PanelCreatePayload,
  PanelDescriptor,
  PanelMenuActionPayload,
  PanelMenuState,
  PanelOpenExternalPayload,
  PanelState,
  PanelUpdatePayload,
  SiteInfo
} from '../../shared/types';
import type { ConfigStore } from '../store/ConfigStore';
import { hydratePanelsForRenderer } from '../services/IconAssetService';
import { logger } from '../utils/logger';
import { getIconsPath } from '../utils/paths';
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
  const persistCustomIconPath = async (panelId: string, iconPath: string): Promise<string> => {
    const extension = extname(iconPath) || '.png';
    const targetDir = getIconsPath();
    const targetPath = join(targetDir, `${panelId}${extension}`);
    await mkdir(targetDir, { recursive: true });

    if (resolve(iconPath) !== resolve(targetPath)) {
      await copyFile(iconPath, targetPath);
    }

    return targetPath;
  };

  const persistIconSource = async (
    panelId: string,
    iconSource: PanelDescriptor['iconSource']
  ): Promise<PanelDescriptor['iconSource']> => {
    if (iconSource.kind !== 'custom' || !iconSource.path) {
      return iconSource;
    }

    return {
      ...iconSource,
      path: await persistCustomIconPath(panelId, iconSource.path)
    };
  };

  const emitPanelsUpdated = async (
    panels: PanelDescriptor[],
    highlightedPanelId: string | null = null
  ): Promise<void> => {
    const sortedPanels = [...panels].sort((left, right) => left.order - right.order);
    const hydratedPanels = await hydratePanelsForRenderer(sortedPanels);

    windowManager.notifyPanelsUpdated({
      panels: hydratedPanels,
      highlightedPanelId
    });
  };

  ipcMain.handle(IPC_CHANNELS.panelsList, async (): Promise<IpcResult<PanelDescriptor[]>> => {
    try {
      const config = await configStore.read();
      return {
        ok: true,
        data: await hydratePanelsForRenderer(
          [...config.panels].sort((left, right) => left.order - right.order)
        )
      };
    } catch (error) {
      logger.error('panels:list failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown panel list error'
      };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.panelsAdd,
    async (_event, payload: PanelCreatePayload): Promise<IpcResult<PanelDescriptor>> => {
      try {
        const config = await configStore.read();
        const panelId = nanoid();
        const iconSource = await persistIconSource(panelId, payload.iconSource);

        const nextPanel: PanelDescriptor = {
          id: panelId,
          type: payload.type,
          title: payload.title.trim(),
          iconSource,
          preferredWidth: payload.preferredWidth,
          web: payload.web,
          order: config.panels.length
        };

        const nextConfig = await configStore.update({
          panels: [...config.panels, nextPanel]
        });

        await emitPanelsUpdated(nextConfig.panels, nextPanel.id);

        return {
          ok: true,
          data: nextPanel
        };
      } catch (error) {
        logger.error('panels:add failed', error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown panel add error'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.panelsUpdate,
    async (_event, payload: PanelUpdatePayload): Promise<IpcResult<PanelDescriptor>> => {
      try {
        const config = await configStore.read();
        const currentPanel = config.panels.find((panel) => panel.id === payload.id);
        if (!currentPanel) {
          return { ok: false, error: 'Panel not found' };
        }

        const nextIconSource = payload.patch.iconSource
          ? await persistIconSource(payload.id, payload.patch.iconSource)
          : currentPanel.iconSource;

        const nextPanel: PanelDescriptor = {
          ...currentPanel,
          title: payload.patch.title?.trim() || currentPanel.title,
          iconSource: nextIconSource,
          preferredWidth: payload.patch.preferredWidth ?? currentPanel.preferredWidth,
          web: currentPanel.web
            ? {
                ...currentPanel.web,
                ...payload.patch.web
              }
            : currentPanel.web
        };

        const nextPanels = config.panels.map((panel) => (panel.id === payload.id ? nextPanel : panel));
        const nextConfig = await configStore.update({ panels: nextPanels });
        if (windowManager.getActivePanelId() === payload.id) {
          await windowManager.hidePanel(true);
        } else {
          windowManager.destroyPanelView(payload.id);
        }
        await emitPanelsUpdated(nextConfig.panels, payload.id);

        return {
          ok: true,
          data: nextPanel
        };
      } catch (error) {
        logger.error('panels:update failed', error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown panel update error'
        };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.panelsReorder, async (_event, panelIds: string[]): Promise<IpcResult<void>> => {
    try {
      const config = await configStore.read();
      const orderMap = new Map(panelIds.map((id, index) => [id, index]));
      const nextPanels = [...config.panels]
        .sort((left, right) => {
          const leftOrder = orderMap.get(left.id);
          const rightOrder = orderMap.get(right.id);

          if (leftOrder == null && rightOrder == null) {
            return left.order - right.order;
          }

          if (leftOrder == null) {
            return 1;
          }

          if (rightOrder == null) {
            return -1;
          }

          return leftOrder - rightOrder;
        })
        .map((panel, index) => ({
          ...panel,
          order: index
        }));

      const nextConfig = await configStore.update({ panels: nextPanels });
      await emitPanelsUpdated(nextConfig.panels);

      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('panels:reorder failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown panel reorder error'
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

  ipcMain.handle(
    IPC_CHANNELS.panelsMenuOpen,
    async (_event, payload: import('../../shared/types').PanelMenuAnchor): Promise<IpcResult<void>> => {
      try {
        await windowManager.openPanelMenu(payload);
        return { ok: true, data: undefined };
      } catch (error) {
        logger.error('panels:menu-open failed', error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown panel menu open error'
        };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.panelsMenuClose, async (): Promise<IpcResult<void>> => {
    try {
      windowManager.closePanelMenu();
      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('panels:menu-close failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown panel menu close error'
      };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.panelsMenuCloseAndResumeHover,
    async (): Promise<IpcResult<void>> => {
      try {
        windowManager.closePanelMenuAndResumeHover();
        return { ok: true, data: undefined };
      } catch (error) {
        logger.error('panels:menu-close-and-resume-hover failed', error);
        return {
          ok: false,
          error:
            error instanceof Error
              ? error.message
              : 'Unknown panel menu close and resume hover error'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.panelsMenuState,
    async (_event, payload: { panelId: string }): Promise<IpcResult<PanelMenuState>> => {
      try {
        const state = await windowManager.getPanelMenuState(payload.panelId);
        if (!state) {
          return { ok: false, error: 'Panel menu state unavailable' };
        }

        return { ok: true, data: state };
      } catch (error) {
        logger.error('panels:menu-state failed', error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown panel menu state error'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.panelsMenuAction,
    async (_event, payload: PanelMenuActionPayload): Promise<IpcResult<PanelMenuState>> => {
      try {
        const state = await windowManager.runPanelMenuAction(payload.panelId, payload.action);
        if (!state) {
          return { ok: false, error: 'Panel menu action unavailable' };
        }

        return { ok: true, data: state };
      } catch (error) {
        logger.error('panels:menu-action failed', error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown panel menu action error'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.panelsOpenExternal,
    async (_event, payload: PanelOpenExternalPayload): Promise<IpcResult<void>> => {
      try {
        await windowManager.openPanelExternal(payload.panelId, payload.url);
        return { ok: true, data: undefined };
      } catch (error) {
        logger.error('panels:open-external failed', error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown panel open external error'
        };
      }
    }
  );

  ipcMain.handle(
    IPC_CHANNELS.panelsGoBack,
    async (_event, payload: import('../../shared/types').PanelActionPayload): Promise<IpcResult<void>> => {
      try {
        await windowManager.goBackPanel(payload.panelId);
        return { ok: true, data: undefined };
      } catch (error) {
        logger.error('panels:go-back failed', error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown panel go back error'
        };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.panelsPickIcon, async (): Promise<IpcResult<string | null>> => {
    try {
      const dialogResult = await dialog.showOpenDialog({
        title: '选择自定义图标',
        properties: ['openFile'],
        filters: [
          {
            name: '图标文件',
            extensions: ['png', 'jpg', 'jpeg', 'svg', 'ico', 'webp']
          }
        ]
      });

      if (dialogResult.canceled || dialogResult.filePaths.length === 0) {
        return { ok: true, data: null };
      }

      return { ok: true, data: dialogResult.filePaths[0] };
    } catch (error) {
      logger.error('panels:pick-icon failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown panel icon picker error'
      };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.panelsGetSiteInfo,
    async (_event, payload: { panelId: string }): Promise<IpcResult<SiteInfo>> => {
      try {
        const info = await windowManager.getSiteInfo(payload.panelId);
        if (!info) {
          return { ok: false, error: 'Panel site info unavailable' };
        }

        return { ok: true, data: info };
      } catch (error) {
        logger.error('panels:get-site-info failed', error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown panel site info error'
        };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.panelsRemove, async (_event, payload: { id: string }) => {
    try {
      const config = await configStore.read();
      const nextPanels = config.panels
        .filter((panel) => panel.id !== payload.id)
        .map((panel, index) => ({
          ...panel,
          order: index
        }));

      const nextConfig = await configStore.update({ panels: nextPanels });

      if (windowManager.getActivePanelId() === payload.id) {
        await windowManager.hidePanel(true);
      }

      await emitPanelsUpdated(nextConfig.panels);

      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('panels:remove failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown panel remove error'
      };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.panelsContextMenu,
    async (_event, payload: { id: string }): Promise<IpcResult<void>> => {
      try {
        const config = await configStore.read();
        const panel = config.panels.find((item) => item.id === payload.id);
        if (!panel) {
          return { ok: false, error: 'Panel not found' };
        }

        const menu = Menu.buildFromTemplate([
          {
            label: '从边栏取消固定',
            click: async () => {
              try {
                const latestConfig = await configStore.read();
                const nextPanels = latestConfig.panels
                  .filter((item) => item.id !== payload.id)
                  .map((item, index) => ({
                    ...item,
                    order: index
                  }));
                const nextConfig = await configStore.update({ panels: nextPanels });

                if (windowManager.getActivePanelId() === payload.id) {
                  await windowManager.hidePanel(true);
                }

                await emitPanelsUpdated(nextConfig.panels);
              } catch (error) {
                logger.error('panels:context-menu remove failed', error);
              }
            }
          }
        ]);

        menu.popup({
          window: windowManager.getDockWindow()?.getBrowserWindow() ?? undefined
        });

        return { ok: true, data: undefined };
      } catch (error) {
        logger.error('panels:context-menu failed', error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown panel context menu error'
        };
      }
    }
  );

  ipcMain.handle(IPC_CHANNELS.panelTogglePin, async (): Promise<IpcResult<void>> => {
    try {
      await windowManager.togglePanelPin();
      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('panel:toggle-pin failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown toggle pin error'
      };
    }
  });

  ipcMain.handle(
    IPC_CHANNELS.panelCommitResize,
    async (_event, width: number): Promise<IpcResult<void>> => {
      try {
        windowManager.commitPanelResize(width);
        return { ok: true, data: undefined };
      } catch (error) {
        logger.error('panel:commit-resize failed', error);
        return {
          ok: false,
          error: error instanceof Error ? error.message : 'Unknown commit resize error'
        };
      }
    }
  );
};
