import { app, session } from 'electron';
import { rm } from 'node:fs/promises';
import { join } from 'node:path';
import { logger } from './logger';

const DEV_SHARED_PARTITION = 'persist:shared';

const safeRemove = async (targetPath: string): Promise<void> => {
  await rm(targetPath, { recursive: true, force: true });
};

export const resetDevelopmentData = async (): Promise<void> => {
  if (!process.env.ELECTRON_RENDERER_URL) {
    return;
  }

  // 默认只清 web 会话/缓存（保证开发期 web 端是干净的），
  // **保留 config.json 与 icons**，这样用户在 dev 模式下添加的站点能跨重启保留。
  // 需要回到带测试面板的默认配置时显式 SIDEBAR_PLUS_RESET_CONFIG=1。
  const wipeConfig = process.env.SIDEBAR_PLUS_RESET_CONFIG === '1';

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
