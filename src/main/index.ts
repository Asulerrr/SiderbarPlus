import { app, BrowserWindow, globalShortcut, session } from 'electron';

app.commandLine.appendSwitch('disable-features', 'UserAgentClientHint,UserAgentClientHints,FedCm,FedCmWithoutWellKnownEnforcement,FedCmIdpSigninStatus,FedCmButtonMode,FedCmMultipleIdentityProviders');

const CHROME_UA = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
app.commandLine.appendSwitch('user-agent', CHROME_UA);
app.userAgentFallback = CHROME_UA;
import { join } from 'node:path';
import { APP_ID, APP_NAME, BUILTIN_SETTINGS_ID } from '../shared/constants';
import { registerIpcHandlers } from './ipc';
import { emitPanelState } from './utils/panelState';
import { AutoLaunchService } from './services/AutoLaunchService';
import { FullscreenWatcher } from './services/FullscreenWatcher';
import { ConfigStore } from './store/ConfigStore';
import { resetDevelopmentData } from './utils/devReset';
import { TrayManager } from './tray/TrayManager';
import { logger } from './utils/logger';
import { WindowManager } from './windows/WindowManager';

let windowManager: WindowManager | null = null;
let trayManager: TrayManager | null = null;
let configStoreRef: ConfigStore | null = null;

// PRD §5.9.1：--autostart 参数代表静默启动（开机触发）。当前应用启动后 dock
// 自动 showInactive，无欢迎弹窗，与正常启动无可见差异；保留参数解析与日志，
// 后续若加欢迎/首次引导 UI 时可据此跳过。
const isAutoStart = process.argv.includes('--autostart');

const bootstrap = async (): Promise<void> => {
  app.setAppUserModelId(APP_ID);
  app.setName(APP_NAME);
  app.setPath('userData', join(app.getPath('appData'), APP_NAME));
  await resetDevelopmentData();

  const configStore = new ConfigStore();
  configStoreRef = configStore;
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

  // 全局快捷键：Alt+` 在鼠标所在面板区域内固定/取消固定
  globalShortcut.register('Alt+`', () => {
    void windowManager?.togglePanelPinIfCursorOverPanel();
  });

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

// 退出前注销 AppBar + 销毁所有窗口 + 注销全局快捷键 + 持久化 cookies + 等待 config 写入
app.on('before-quit', (event) => {
  globalShortcut.unregisterAll();
  windowManager?.disposeAppBar();
  BrowserWindow.getAllWindows().forEach((w) => {
    if (!w.isDestroyed()) w.destroy();
  });
  // 阻止立即退出，等 config 写入 + cookie 刷盘 + Windows 处理 ABM_REMOVE 的 work area 恢复
  event.preventDefault();
  Promise.all([
    configStoreRef?.waitForPendingWrites() ?? Promise.resolve(),
    session.fromPartition('persist:shared', { cache: true }).cookies.flushStore()
  ])
    .then(() => {
      // ABM_REMOVE 发送 WM_SETTINGCHANGE 给所有顶层窗口，其他应用需要时间
      // 接收并处理。立即 exit 会让 Windows 消息来不及投递，work area 残留。
      setTimeout(() => app.exit(0), 500);
    })
    .catch(() => {
      setTimeout(() => app.exit(0), 500);
    });
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
