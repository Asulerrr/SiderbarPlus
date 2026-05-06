import { app, session } from 'electron';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from './logger';

const DEV_SHARED_PARTITION = 'persist:shared';

const safeRemove = async (targetPath: string): Promise<void> => {
  await rm(targetPath, { recursive: true, force: true });
};

export const resetDevelopmentData = async (): Promise<void> => {
  const isDev = Boolean(process.env.ELECTRON_RENDERER_URL);

  // Always clear session cache to prevent stale security state
  // from interfering with login flows (Google, Cloudflare, etc.)
  try {
    const sharedSession = session.fromPartition(DEV_SHARED_PARTITION, { cache: true });
    await sharedSession.clearCache();
  } catch (error) {
    logger.warn('Failed to clear shared session cache.', error);
  }

  if (!isDev) {
    return;
  }

  // 每次 dev 重启都用最新的 DEFAULT_CONFIG 覆盖旧配置，
  // 确保 constants.ts 的改动立即生效。
  const wipeConfig = true;

  const userDataPath = app.getPath('userData');
  // 注意：Windows NTFS 大小写不敏感，'Cache' 与 'cache' 解析为同一目录。
  // 我们的 favicon 缓存现在放在 'favicon-cache/'（见 paths.ts）独占命名，
  // 不会被这里清掉。
  const sessionTargets = [
    // 不删 Partitions/persist:shared——保留 cookies/登录态
    join(userDataPath, 'Session Storage'),
    join(userDataPath, 'Local Storage'),
    join(userDataPath, 'SharedStorage'),
    join(userDataPath, 'SharedStorage-wal'),
    join(userDataPath, 'blob_storage'),
    join(userDataPath, 'Network'),
    join(userDataPath, 'Code Cache'),
    join(userDataPath, 'Cache'),
    join(userDataPath, 'GPUCache'),
    join(userDataPath, 'DawnGraphiteCache'),
    join(userDataPath, 'DawnWebGPUCache')
  ];
  const configTargets = [
    join(userDataPath, 'config.json'),
    join(userDataPath, 'config.json.bak'),
    join(userDataPath, 'config.json.tmp'),
    join(userDataPath, 'icons'),
    join(userDataPath, 'favicon-cache')
  ];
  const targets = wipeConfig ? [...configTargets, ...sessionTargets] : sessionTargets;

  try {
    // 只清缓存，不碰 shared session 的 cookies/存储——保留登录态
    const sharedSession = session.fromPartition(DEV_SHARED_PARTITION, { cache: true });
    await sharedSession.clearCache();
  } catch (error) {
    logger.warn('Failed to clear development shared session cache.', error);
  }

  for (const target of targets) {
    try {
      await safeRemove(target);
    } catch (error) {
      logger.warn(`Failed to remove development data path: ${target}`, error);
    }
  }

  logger.info('Development data reset completed.', { wipeConfig });
};
