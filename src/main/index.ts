import { app, BrowserWindow } from 'electron';
import { join } from 'node:path';
import { APP_ID, APP_NAME } from '../shared/constants';
import { registerIpcHandlers } from './ipc';
import { ConfigStore } from './store/ConfigStore';
import { logger } from './utils/logger';
import { WindowManager } from './windows/WindowManager';

let windowManager: WindowManager | null = null;

const bootstrap = async (): Promise<void> => {
  app.setAppUserModelId(APP_ID);
  app.setName(APP_NAME);
  app.setPath('userData', join(app.getPath('appData'), APP_NAME));

  const configStore = new ConfigStore();
  const config = await configStore.initialize();

  registerIpcHandlers(configStore);

  windowManager = new WindowManager(config);
  windowManager.createWindows();

  logger.info(`${APP_NAME} started`);
};

app.whenReady().then(() => {
  void bootstrap();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0 && windowManager) {
      windowManager.createWindows();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
