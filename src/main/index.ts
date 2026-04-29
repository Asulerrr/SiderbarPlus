import { app, BrowserWindow, session } from 'electron';
import { join } from 'node:path';
import { APP_ID, APP_NAME, BUILTIN_SETTINGS_ID } from '../shared/constants';
import type { PanelState } from '../shared/types';
import { registerIpcHandlers } from './ipc';
import { AutoLaunchService } from './services/AutoLaunchService';
import { FullscreenWatcher } from './services/FullscreenWatcher';
import { ConfigStore } from './store/ConfigStore';
import { resetDevelopmentData } from './utils/devReset';
import { TrayManager } from './tray/TrayManager';
import { logger } from './utils/logger';
import { WindowManager } from './windows/WindowManager';

let windowManager: WindowManager | null = null;
let trayManager: TrayManager | null = null;

// PRD §5.9.1：--autostart 参数代表静默启动（开机触发）。当前应用启动后 dock
// 自动 showInactive，无欢迎弹窗，与正常启动无可见差异；保留参数解析与日志，
// 后续若加欢迎/首次引导 UI 时可据此跳过。
const isAutoStart = process.argv.includes('--autostart');

const emitPanelState = (state: PanelState): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.getTitle() === 'SideBar Plus Panel Animation') {
      continue;
    }

    window.webContents.send('panel:state', state);
  }
};

const bootstrap = async (): Promise<void> => {
  app.setAppUserModelId(APP_ID);
  app.setName(APP_NAME);
  app.setPath('userData', join(app.getPath('appData'), APP_NAME));
  await resetDevelopmentData();

  const configStore = new ConfigStore();
  const config = await configStore.initialize();

  const autoLaunchService = new AutoLaunchService();
  // 启动时确保系统注册表与 config 一致（用户改了 config 没切换前关机的情况）
  await autoLaunchService.sync(config.app.autoLaunch);

  windowManager = new WindowManager(config, configStore, emitPanelState);
  windowManager.createWindows();

  // PRD §5.9.4 全屏检测：
  // 把所有自身窗口的 native handle 加入排除集，避免 dock/panel 自身被误判为全屏
  const fullscreenWatcher = new FullscreenWatcher(
    () => windowManager?.hideForFullscreen(),
    () => windowManager?.restoreFromFullscreen()
  );
  for (const win of BrowserWindow.getAllWindows()) {
    fullscreenWatcher.excludeWindow(win.getNativeWindowHandle());
  }
  if (config.app.hideOnFullscreen) {
    fullscreenWatcher.start();
  }

  trayManager = new TrayManager({
    onToggleDock: () => windowManager?.toggleDockVisibility(),
    onShowDock: () => windowManager?.showDockFromTray(),
    onHideDock: () => windowManager?.hideDockToTray(),
    onOpenSettings: () => {
      void windowManager?.showPanel(BUILTIN_SETTINGS_ID, true);
    },
    onOpenAbout: () => {
      void windowManager?.showPanel(BUILTIN_SETTINGS_ID, true);
    },
    onQuit: () => {
      windowManager?.disposeAppBar();
      app.quit();
    },
    isDockVisible: () => windowManager?.isDockVisible() ?? false
  });
  trayManager.create();

  registerIpcHandlers(
    configStore,
    windowManager,
    trayManager,
    autoLaunchService,
    fullscreenWatcher
  );

  logger.info(`${APP_NAME} started`, { isAutoStart });
};

// PRD §5.9.3 单实例锁：第二个实例立即退出，已运行实例激活 Dock。
// 必须在 app.whenReady() 之前请求锁。
const gotSingleInstanceLock = app.requestSingleInstanceLock();
if (!gotSingleInstanceLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    windowManager?.activateExistingInstance();
  });

  app.whenReady().then(() => {
    void bootstrap();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0 && windowManager) {
        windowManager.createWindows();
      }
    });
  });
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

// 退出前注销 AppBar + 销毁所有窗口 + 持久化 cookies
app.on('before-quit', (event) => {
  windowManager?.disposeAppBar();
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.destroy();
  });
  // 阻止立即退出，等 cookie 刷盘完成
  event.preventDefault();
  session
    .fromPartition('persist:shared', { cache: true })
    .cookies.flushStore()
    .then(() => app.exit(0))
    .catch(() => app.exit(0));
});

// will-quit 是最后一道防线：确保所有窗口已销毁
app.on('will-quit', () => {
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.destroy();
  });
});

// Ctrl+C / 终端关停：销毁窗口 + 注销 AppBar + app.quit()
// before-quit 统一处理 cookie 刷盘
const gracefulShutdown = (): void => {
  windowManager?.disposeAppBar();
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.destroy();
  });
  app.quit();
};
process.on('SIGINT', gracefulShutdown);
process.on('SIGTERM', gracefulShutdown);
