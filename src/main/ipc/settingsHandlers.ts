import { app, dialog, ipcMain, session, shell } from 'electron';
import { copyFile, readFile } from 'node:fs/promises';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { UpdateCheckResult } from '../../shared/ipc-contracts';
import type { AppConfig, IpcResult } from '../../shared/types';
import { logger } from '../utils/logger';
import { getConfigPath } from '../utils/paths';
import type { ConfigStore } from '../store/ConfigStore';
import type { WindowManager } from '../windows/WindowManager';

const DEFAULT_UPDATE_REPO = 'Asulerrr/SiderbarPlus';

const compareSemver = (a: string, b: string): number => {
  const parse = (v: string): number[] =>
    v
      .split(/[.-]/)
      .map((part) => Number.parseInt(part, 10))
      .map((n) => (Number.isFinite(n) ? n : 0));
  const pa = parse(a);
  const pb = parse(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i += 1) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
};

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
        defaultPath: 'sidebar-config.json',
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
      await session.defaultSession.clearCache();
      await windowManager.clearAllWebStorageData();
      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('settings:clear-storage-data failed', error);
      return { ok: false, error: error instanceof Error ? error.message : 'unknown' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.settingsCheckUpdate, async (): Promise<
    IpcResult<UpdateCheckResult>
  > => {
    const currentVersion = app.getVersion();
    const repo = process.env.SIDEBAR_PLUS_UPDATE_REPO?.trim() || DEFAULT_UPDATE_REPO;

    try {
      const response = await fetch(`https://api.github.com/repos/${repo}/releases/latest`, {
        headers: { Accept: 'application/vnd.github+json' }
      });
      if (!response.ok) {
        throw new Error(`GitHub API ${response.status}`);
      }
      const json = (await response.json()) as { tag_name?: string; html_url?: string };
      const latestRaw = (json.tag_name ?? '').trim();
      const latest = latestRaw.replace(/^v/i, '');
      const status: UpdateCheckResult['status'] =
        latest && compareSemver(latest, currentVersion) > 0 ? 'available' : 'up-to-date';
      return {
        ok: true,
        data: { current: currentVersion, latest: latest || null, status, url: json.html_url }
      };
    } catch (error) {
      logger.error('settings:check-update failed', error);
      return {
        ok: true,
        data: {
          current: currentVersion,
          latest: null,
          status: 'error',
          error: error instanceof Error ? error.message : 'unknown'
        }
      };
    }
  });

  ipcMain.handle(IPC_CHANNELS.settingsAppVersion, async (): Promise<IpcResult<string>> => ({
    ok: true,
    data: app.getVersion()
  }));

  ipcMain.handle(IPC_CHANNELS.settingsQuitApp, async (): Promise<IpcResult<void>> => {
    app.quit();
    return { ok: true, data: undefined };
  });
};
