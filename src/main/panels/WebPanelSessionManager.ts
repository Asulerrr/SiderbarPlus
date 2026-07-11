import { app, Notification, session, shell } from 'electron';
import { join } from 'node:path';
import type { AppConfig } from '../../shared/types';
import { SHARED_PARTITION, resolvePanelPartition } from './panelSessionPartition';

export class WebPanelSessionManager {
  private readonly configuredPartitions = new Set<string>();

  constructor(private readonly getConfig: () => AppConfig | null) {}

  ensureSession(partition: string): Electron.Session {
    const ses = session.fromPartition(partition, { cache: true });
    if (this.configuredPartitions.has(partition)) return ses;
    this.configuredPartitions.add(partition);

    ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
      if (permission === 'clipboard-sanitized-write') {
        return this.isConfiguredOrigin(requestingOrigin);
      }
      if (permission === 'clipboard-read') return false;
      if (permission !== 'notifications') return false;
      return this.isNotificationAllowed(requestingOrigin);
    });

    ses.setPermissionRequestHandler((webContents, permission, callback) => {
      const url = webContents.getURL();
      if (permission === 'clipboard-sanitized-write') {
        callback(this.isConfiguredOrigin(url));
        return;
      }
      if (permission === 'clipboard-read') {
        callback(false);
        return;
      }
      if (permission !== 'notifications') {
        callback(false);
        return;
      }
      callback(this.isNotificationAllowed(url));
    });

    ses.webRequest.onHeadersReceived(
      { urls: ['https://accounts.google.com/*', 'https://*.google.com/*'] },
      (details, callback) => {
        const headers = details.responseHeaders;
        if (headers) {
          delete headers['cross-origin-opener-policy'];
          delete headers['cross-origin-embedder-policy'];
        }
        callback({ responseHeaders: headers });
      }
    );

    ses.on('will-download', (_event, item) => {
      const savePath = join(app.getPath('downloads'), item.getFilename());
      item.setSavePath(savePath);
      new Notification({ title: 'SideBar', body: `开始下载 ${item.getFilename()}` }).show();
      item.once('done', (_downloadEvent, state) => {
        if (state === 'completed') {
          const notification = new Notification({
            title: 'SideBar',
            body: `${item.getFilename()} 下载完成`
          });
          notification.on('click', () => shell.showItemInFolder(savePath));
          notification.show();
          return;
        }
        new Notification({ title: 'SideBar', body: `${item.getFilename()} 下载失败` }).show();
      });
    });

    return ses;
  }

  getSession(partition: string | undefined): Electron.Session {
    return this.ensureSession(partition ?? SHARED_PARTITION);
  }

  async clearAllStorageData(config: AppConfig): Promise<void> {
    const partitions = this.getConfigPartitions(config);
    await Promise.all(
      [...partitions].map(async (partition) => {
        const ses = this.ensureSession(partition);
        await ses.clearStorageData();
        await ses.clearCache();
        await ses.cookies.flushStore();
      })
    );
  }

  async flushCookies(config: AppConfig): Promise<void> {
    await Promise.all(
      [...this.getConfigPartitions(config)].map((partition) =>
        this.ensureSession(partition).cookies.flushStore()
      )
    );
  }

  private getConfigPartitions(config: AppConfig): Set<string> {
    return new Set([
      SHARED_PARTITION,
      ...this.configuredPartitions,
      ...config.panels.map((panel) => resolvePanelPartition(panel))
    ]);
  }

  private isConfiguredOrigin(originOrUrl: string): boolean {
    const config = this.getConfig();
    if (!config) return false;

    try {
      const origin = new URL(originOrUrl).origin;
      return config.panels.some((panel) => {
        try {
          return panel.web?.url ? new URL(panel.web.url).origin === origin : false;
        } catch {
          return false;
        }
      });
    } catch {
      return false;
    }
  }

  private isNotificationAllowed(originOrUrl: string): boolean {
    const config = this.getConfig();
    if (!config) return false;

    try {
      const origin = new URL(originOrUrl).origin;
      const descriptor = config.panels.find((panel) => {
        try {
          return panel.web?.url ? new URL(panel.web.url).origin === origin : false;
        } catch {
          return false;
        }
      });
      return Boolean(descriptor) && !(descriptor?.web?.notificationsSnoozed ?? false);
    } catch {
      return false;
    }
  }
}
