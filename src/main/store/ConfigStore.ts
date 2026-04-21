import { mkdir, readFile, rename, rm, stat, writeFile, copyFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { DEFAULT_CONFIG } from '../../shared/constants';
import type { AppConfig } from '../../shared/types';
import { logger } from '../utils/logger';
import { getConfigBackupPath, getConfigPath, getTempConfigPath } from '../utils/paths';
import { migrateConfig } from './migrations';

export class ConfigStore {
  private config: AppConfig | null = null;

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
    const configPath = getConfigPath();
    const backupPath = getConfigBackupPath();
    const tempPath = getTempConfigPath();

    await mkdir(dirname(configPath), { recursive: true });
    await writeFile(tempPath, `${JSON.stringify(config, null, 2)}\n`, 'utf8');
    await rm(configPath, { force: true });
    await rename(tempPath, configPath);
    await copyFile(configPath, backupPath);
  }
}
