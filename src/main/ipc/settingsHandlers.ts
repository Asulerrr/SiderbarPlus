import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import { copyFile, readFile } from 'node:fs/promises';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { AppConfig, IpcResult } from '../../shared/types';
import { logger } from '../utils/logger';
import { getConfigPath } from '../utils/paths';
import type { ConfigStore } from '../store/ConfigStore';
import type { WindowManager } from '../windows/WindowManager';

const isValidConfigShape = (raw: unknown): raw is AppConfig => {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  return (
    typeof obj.app === 'object' &&
    typeof obj.layout === 'object' &&
    typeof obj.behavior === 'object' &&
    Array.isArray(obj.panels) &&
    typeof obj.appearance === 'object'
  );
};

export const registerSettingsHandlers = (
  configStore: ConfigStore,
  windowManager: WindowManager
): void => {
  ipcMain.handle(IPC_CHANNELS.settingsOpenConfigFolder, async (): Promise<IpcResult<void>> => {
    try {
      await shell.openPath(app.getPath('userData'));
      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('settings:open-config-folder failed', error);
      return { ok: false, error: error instanceof Error ? error.message : 'unknown' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.settingsExportConfig, async (): Promise<
    IpcResult<{ canceled: boolean; path?: string }>
  > => {
    try {
      const result = await dialog.showSaveDialog({
        title: '导出配置',
        defaultPath: 'sidebar-plus-config.json',
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });
      if (result.canceled || !result.filePath) {
        return { ok: true, data: { canceled: true } };
      }
      await copyFile(getConfigPath(), result.filePath);
      return { ok: true, data: { canceled: false, path: result.filePath } };
    } catch (error) {
      logger.error('settings:export-config failed', error);
      return { ok: false, error: error instanceof Error ? error.message : 'unknown' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.settingsImportConfig, async (): Promise<
    IpcResult<{ canceled: boolean; restartRequired: boolean }>
  > => {
    try {
      const result = await dialog.showOpenDialog({
        title: '导入配置',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile']
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: true, data: { canceled: true, restartRequired: false } };
      }
      const raw = await readFile(result.filePaths[0], 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!isValidConfigShape(parsed)) {
        return { ok: false, error: '配置文件格式无效' };
      }
      const next = await configStore.update(parsed as Partial<AppConfig>);
      await windowManager.reloadAfterImport(next);
      return { ok: true, data: { canceled: false, restartRequired: false } };
    } catch (error) {
      logger.error('settings:import-config failed', error);
      return { ok: false, error: error instanceof Error ? error.message : 'unknown' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.settingsClearStorageData, async (): Promise<IpcResult<void>> => {
    try {
      await session.defaultSession.clearStorageData();
      for (const win of BrowserWindow.getAllWindows()) {
        const ses = win.webContents.session;
        if (ses !== session.defaultSession) {
          await ses.clearStorageData();
        }
      }
      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('settings:clear-storage-data failed', error);
      return { ok: false, error: error instanceof Error ? error.message : 'unknown' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.settingsCheckUpdate, async (): Promise<
    IpcResult<{ status: 'placeholder' }>
  > => {
    return { ok: true, data: { status: 'placeholder' } };
  });

  ipcMain.handle(IPC_CHANNELS.settingsQuitApp, async (): Promise<IpcResult<void>> => {
    app.quit();
    return { ok: true, data: undefined };
  });
};
