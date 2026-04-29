import { ipcMain, Menu, screen } from 'electron';
import { BUILTIN_ADD_SITE_ID, BUILTIN_SETTINGS_ID } from '../../shared/constants';
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
      // 防御：dockWindow 隐藏状态下 menu.popup 在 Windows 上可能无法弹出
      // 或弹出后无法接收点击。menu-will-close 也可能不触发，导致后续 ⋮ 无反应。
      // 强制 dock 可见并取得焦点上下文。
      if (dockWindow && !dockWindow.isVisible()) {
        dockWindow.showInactive();
      }

      // dock 底部 + / 设置 与 ⋮ 互斥：add-site 或 settings 面板展开时点 ⋮
      // 自动收起，让用户与 quick menu 交互前有干净的视觉状态。
      const activeId = windowManager.getActivePanelId();
      if (activeId === BUILTIN_ADD_SITE_ID || activeId === BUILTIN_SETTINGS_ID) {
        await windowManager.hidePanel(true);
      }

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
            void windowManager.showPanel(BUILTIN_SETTINGS_ID, true);
          }
        }
      ]);

      // 冻结 panel 隐藏逻辑：原生菜单没有 BrowserWindow，几何检测会把菜单
      // 区误判为 dock 外，导致 add-site 等悬停面板在菜单展开期间被关闭，
      // 用户从菜单移出时鼠标若掠过 '+' 又会触发重开 → 视觉为闪烁。
      // 用带过期时间的静默窗口而非 boolean lock：menu-will-close 即便没触发，
      // 5s 后也会自动恢复，不会让面板永远停在不可隐藏状态。
      windowManager.muteHide(5000);
      menu.once('menu-will-close', () => {
        windowManager.clearHideMute();
      });

      // 菜单定位：边缘对齐 dock、底部对齐 ⋮ 按钮
      const MENU_WIDTH_EST = 200;
      const MENU_HEIGHT_EST = displays.length > 1 ? 190 : 160;
      const BUTTON_BOTTOM_FROM_DOCK = 44; // pb-0.5(2px) + X按钮(42px)
      const dockBounds = dockWindow?.getBounds();
      const edge = config.layout.edge;
      const popupX =
        edge === 'right'
          ? (dockBounds?.x ?? 0) - MENU_WIDTH_EST
          : (dockBounds?.x ?? 0) + (dockBounds?.width ?? 44);
      const popupY =
        (dockBounds?.y ?? 0) + (dockBounds?.height ?? 0) - BUTTON_BOTTOM_FROM_DOCK - MENU_HEIGHT_EST;

      menu.popup({
        window: dockWindow,
        x: Math.round(popupX),
        y: Math.round(popupY)
      });
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
