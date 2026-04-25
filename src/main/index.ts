import { app, BrowserWindow, dialog } from 'electron';
import { join } from 'node:path';
import { APP_ID, APP_NAME, APP_VERSION } from '../shared/constants';
import type { PanelState } from '../shared/types';
import { registerIpcHandlers } from './ipc';
import { AutoLaunchService } from './services/AutoLaunchService';
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

  trayManager = new TrayManager({
    onToggleDock: () => windowManager?.toggleDockVisibility(),
    onShowDock: () => windowManager?.showDockFromTray(),
    onHideDock: () => windowManager?.hideDockToTray(),
    onOpenSettings: () => {
      void dialog.showMessageBox({
        type: 'info',
        title: '设置',
        message: '设置面板将在 M8 实现。',
        detail: 'M2 阶段先保留托盘入口。'
      });
    },
    onOpenAbout: () => {
      void dialog.showMessageBox({
        type: 'info',
        title: APP_NAME,
        message: `${APP_NAME} ${APP_VERSION}`,
        detail: 'M2 阶段占位入口，完整关于与检查更新将在后续阶段实现。'
      });
    },
    onQuit: () => app.quit(),
    isDockVisible: () => windowManager?.isDockVisible() ?? false
  });
  trayManager.create();

  registerIpcHandlers(configStore, windowManager, trayManager, autoLaunchService);

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
