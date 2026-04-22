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

  const userDataPath = app.getPath('userData');
  const targets = [
    join(userDataPath, 'config.json'),
    join(userDataPath, 'config.json.bak'),
    join(userDataPath, 'config.json.tmp'),
    join(userDataPath, 'icons'),
    join(userDataPath, 'cache'),
    join(userDataPath, 'Partitions', DEV_SHARED_PARTITION),
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

  try {
    const sharedSession = session.fromPartition(DEV_SHARED_PARTITION, { cache: true });
    await sharedSession.clearStorageData();
    await sharedSession.clearCache();
  } catch (error) {
    logger.warn('Failed to clear development shared session before reset.', error);
  }

  for (const target of targets) {
    try {
      await safeRemove(target);
    } catch (error) {
      logger.warn(`Failed to remove development data path: ${target}`, error);
    }
  }

  logger.info('Development data reset completed.');
};
