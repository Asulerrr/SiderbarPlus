import { app } from 'electron';
import { join } from 'node:path';

export const getUserDataPath = (): string => app.getPath('userData');

export const getConfigPath = (): string => join(getUserDataPath(), 'config.json');

export const getConfigBackupPath = (): string => join(getUserDataPath(), 'config.json.bak');

export const getTempConfigPath = (): string => join(getUserDataPath(), 'config.json.tmp');

export const getIconsPath = (): string => join(getUserDataPath(), 'icons');

// 注意：必须避开 'Cache' / 'cache' 名字。Windows NTFS 默认大小写不敏感，
// Chromium 在 userData 下创建 'Cache/' 存 HTTP 缓存，dev reset 会清它；
// 若我们的 favicon 缓存放到 'cache/'（即便小写），与 'Cache/' 解析为同一目录，
// 会被一起删掉。用独占名 'favicon-cache/' 隔离。
export const getFaviconCachePath = (): string => join(getUserDataPath(), 'favicon-cache');
