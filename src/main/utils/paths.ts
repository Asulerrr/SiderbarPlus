import { app } from 'electron';
import { join } from 'node:path';

export const getUserDataPath = (): string => app.getPath('userData');

export const getConfigPath = (): string => join(getUserDataPath(), 'config.json');

export const getConfigBackupPath = (): string => join(getUserDataPath(), 'config.json.bak');

export const getTempConfigPath = (): string => join(getUserDataPath(), 'config.json.tmp');
