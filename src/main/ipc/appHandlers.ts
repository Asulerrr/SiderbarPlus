import { dialog, ipcMain, Menu, screen } from 'electron';
import { APP_NAME, APP_VERSION, BUILTIN_SETTINGS_ID } from '../../shared/constants';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { IpcResult } from '../../shared/types';
import type { AutoLaunchService } from '../services/AutoLaunchService';
import type { ConfigStore } from '../store/ConfigStore';
import type { TrayManager } from '../tray/TrayManager';
import { logger } from '../utils/logger';
import type { WindowManager } from '../windows/WindowManager';

export const registerAppHandlers = (
  windowManager: WindowManager,
  trayManager: TrayManager,
  configStore: ConfigStore,
  autoLaunchService: AutoLaunchService
): void => {
  ipcMain.handle(IPC_CHANNELS.appHideToTray, async (): Promise<IpcResult<void>> => {
    try {
      windowManager.hideDockToTray();
      trayManager.refreshMenu();
      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('app:hide-to-tray failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown hide-to-tray error'
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.appToggleDockVisibility, async (): Promise<IpcResult<boolean>> => {
    try {
      const isVisible = windowManager.toggleDockVisibility();
      trayManager.refreshMenu();
      return { ok: true, data: isVisible };
    } catch (error) {
      logger.error('app:toggle-dock-visibility failed', error);
      return {
        ok: false,
        error:
          error instanceof Error ? error.message : 'Unknown dock visibility toggle error'
      };
    }
  });

  // PRD §5.1.4：dock 底部 ⋮ 按钮弹出原生菜单。
  // 用原生 Menu 而非 HTML 菜单，避免被 44px 宽 dock 窗口边界裁剪。
  ipcMain.handle(IPC_CHANNELS.appOpenQuickMenu, async (): Promise<IpcResult<void>> => {
    try {
      const config = await configStore.read();
      const dockWindow = windowManager.getDockWindow()?.getBrowserWindow() ?? undefined;
      const displays = screen.getAllDisplays();

      const menu = Menu.buildFromTemplate([
        {
          label: '自动启动 Sidebar Plus',
          type: 'checkbox',
          checked: config.app.autoLaunch,
          click: async () => {
            try {
              const next = await configStore.update({
                app: { ...config.app, autoLaunch: !config.app.autoLaunch }
              });
              await autoLaunchService.sync(next.app.autoLaunch);
            } catch (error) {
              logger.error('quick-menu autoLaunch toggle failed', error);
            }
          }
        },
        {
          label: config.layout.edge === 'right' ? '切换到左侧' : '切换到右侧',
          click: async () => {
            try {
              const nextEdge = config.layout.edge === 'right' ? 'left' : 'right';
              const next = await configStore.update({
                layout: { ...config.layout, edge: nextEdge }
              });
              windowManager.applyEdgeChange(next);
            } catch (error) {
              logger.error('quick-menu edge toggle failed', error);
            }
          }
        },
        ...(displays.length > 1
          ? [
              {
                label: '切换显示器',
                click: async () => {
                  try {
                    const currentId = config.layout.displayId ?? screen.getPrimaryDisplay().id;
                    const currentIdx = displays.findIndex((d) => d.id === currentId);
                    const nextIdx = (currentIdx + 1) % displays.length;
                    const nextDisplayId = displays[nextIdx]?.id;
                    if (typeof nextDisplayId !== 'number') {
                      return;
                    }
                    const next = await configStore.update({
                      layout: { ...config.layout, displayId: nextDisplayId }
                    });
                    windowManager.applyEdgeChange(next);
                  } catch (error) {
                    logger.error('quick-menu cycle display failed', error);
                  }
                }
              } as const
            ]
          : []),
        { type: 'separator' },
        {
          label: '设置',
          click: () => {
            void windowManager.showPanel(BUILTIN_SETTINGS_ID, true);
          }
        },
        {
          label: '关于',
          click: () => {
            void dialog.showMessageBox({
              type: 'info',
              title: APP_NAME,
              message: `${APP_NAME} ${APP_VERSION}`,
              detail: 'M2 阶段占位入口，完整关于与检查更新将在后续阶段实现。'
            });
          }
        }
      ]);

      menu.popup({ window: dockWindow });
      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('app:open-quick-menu failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown quick menu error'
      };
    }
  });
};
