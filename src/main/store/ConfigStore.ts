import { mkdir, readFile, rename, stat, writeFile, copyFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DEFAULT_CONFIG } from '../../shared/constants';
import type { AppConfig } from '../../shared/types';
import { logger } from '../utils/logger';
import { buildConfigPersistPlan } from '../utils/configPersistStrategy';
import { getConfigBackupPath, getConfigPath, getTempConfigPath } from '../utils/paths';
import { migrateConfig } from './migrations';

export class ConfigStore {
  private config: AppConfig | null = null;
  // 串行化所有 update 调用。原本并发的 update 会争抢同一个 .tmp 文件 +
  // rename 互相 race，导致 EPERM/ENOENT，部分写入永久丢失（典型场景：
  // 用户拖颜色 / slider 短时间发出几十个 configUpdate IPC）。
  private writeChain: Promise<unknown> = Promise.resolve();

  async initialize(): Promise<AppConfig> {
    if (this.config) {
      return this.config;
    }

    const loaded = await this.readConfigWithFallback();
    this.config = await migrateConfig(loaded);
    await this.persist(this.config);
    return this.config;
  }

  async read(): Promise<AppConfig> {
    if (!this.config) {
      return this.initialize();
    }

    return this.config;
  }

  async update(patch: Partial<AppConfig>): Promise<AppConfig> {
    const next = this.writeChain.then(() => this.doUpdate(patch));
    // 链上一次失败不阻塞后续 update
    this.writeChain = next.catch(() => undefined);
    return next;
  }

  private async doUpdate(patch: Partial<AppConfig>): Promise<AppConfig> {
    const current = await this.read();
    const next: AppConfig = {
      ...current,
      ...patch,
      app: {
        ...current.app,
        ...patch.app
      },
      layout: {
        ...current.layout,
        ...patch.layout
      },
      behavior: {
        ...current.behavior,
        ...patch.behavior
      },
      appearance: {
        ...current.appearance,
        ...patch.appearance
      },
      panels: patch.panels ?? current.panels,
      meta: {
        ...current.meta,
        ...patch.meta,
        lastUpdatedAt: new Date().toISOString()
      }
    };

    this.config = next;
    await this.persist(next);
    return next;
  }

  private async readConfigWithFallback(): Promise<AppConfig> {
    try {
      return await this.readFromPath(getConfigPath());
    } catch (error) {
      logger.warn('Failed to read config.json, attempting backup.', error);
    }

    try {
      return await this.readFromPath(getConfigBackupPath());
    } catch (error) {
      logger.error('Failed to read config backup, using defaults.', error);
      return DEFAULT_CONFIG();
    }
  }

  private async readFromPath(filePath: string): Promise<AppConfig> {
    await stat(filePath);
    const raw = await readFile(filePath, 'utf8');
    return JSON.parse(raw) as AppConfig;
  }

  private async persist(config: AppConfig): Promise<void> {
    const persistPlan = buildConfigPersistPlan({
      configPath: getConfigPath(),
      backupPath: getConfigBackupPath(),
      tempPath: getTempConfigPath()
    });

    await mkdir(dirname(persistPlan.replaceTarget), { recursive: true });
    await writeFile(persistPlan.writeTempTo, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    // Windows 上杀软（Defender 等）扫描刚写出的文件时会短暂占用句柄，
    // rename 命中 EPERM。给一次几十毫秒的重试通常能拿到。
    await this.renameWithRetry(persistPlan.writeTempTo, persistPlan.replaceTarget);
    await copyFile(persistPlan.copyBackupFrom, persistPlan.copyBackupTo);
  }

  private async renameWithRetry(from: string, to: string): Promise<void> {
    const delays = [0, 30, 80, 160];
    let lastError: unknown;
    for (const delay of delays) {
      if (delay > 0) {
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
      try {
        await rename(from, to);
        return;
      } catch (error) {
        lastError = error;
        const code = (error as NodeJS.ErrnoException)?.code;
        if (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES') {
          throw error;
        }
      }
    }
    throw lastError;
  }
}
