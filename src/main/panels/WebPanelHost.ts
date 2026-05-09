import { app, BrowserWindow, clipboard, Notification, session, shell, WebContentsView } from 'electron';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type {
  AppConfig,
  PanelDescriptor,
  PanelMenuState,
  PanelNavigationPayload,
  SiteInfo,
  WebPanelConfig
} from '../../shared/types';
import { BrowserService } from '../services/BrowserService';
import { logger } from '../utils/logger';

const SHARED_PARTITION = 'persist:shared';
const CHROME_USER_AGENT = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
const MOBILE_USER_AGENT =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Mobile/15E148 Safari/604.1';

interface WebPanelHostDependencies {
  readConfig: () => Promise<AppConfig>;
  updateConfig: (patch: Partial<AppConfig>) => Promise<AppConfig>;
  emitNavigation: (payload: PanelNavigationPayload) => void;
}

interface ViewMeta {
  defaultUserAgent: string;
}

export class WebPanelHost {
  private readonly views = new Map<string, WebContentsView>();
  private readonly meta = new Map<string, ViewMeta>();
  private readonly partitions = new Map<string, string>();
  private readonly sharedSession = session.fromPartition(SHARED_PARTITION, { cache: true });
  private readonly browserService = new BrowserService();
  private currentConfig: AppConfig | null = null;
  private readonly sessionsWithHandlers = new Set<string>();

  constructor(private readonly dependencies: WebPanelHostDependencies) {
    this.ensureSessionHandlers(SHARED_PARTITION);
    void this.refreshConfig();
  }

  async refreshConfig(): Promise<void> {
    this.currentConfig = await this.dependencies.readConfig();
  }

  getOrCreateView(descriptor: PanelDescriptor): WebContentsView {
    const partition = descriptor.web?.isolatedSession
      ? `persist:panel-${descriptor.id}`
      : SHARED_PARTITION;

    const existing = this.views.get(descriptor.id);
    if (existing) {
      // Recreate view if session isolation setting changed
      if (this.partitions.get(descriptor.id) !== partition) {
        this.destroyView(descriptor.id);
      } else {
        this.applyViewPreferences(descriptor.id, existing, descriptor.web);
        return existing;
      }
    }

    const view = new WebContentsView({
      webPreferences: {
        partition,
        preload: join(__dirname, '../preload/webPanel.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false,
        nativeWindowOpen: true
      } as any
    });

    this.partitions.set(descriptor.id, partition);
    this.ensureSessionHandlers(partition);

    view.webContents.setBackgroundThrottling(false);
    view.webContents.setVisualZoomLevelLimits(1, 3).catch(() => undefined);
    view.webContents.setWindowOpenHandler(({ url, features }) => {
      // Google login — open popup directly instead of redirecting main view
      try {
        if (new URL(url).hostname === 'accounts.google.com') {
          const popup = new BrowserWindow({
            width: 520,
            height: 600,
            autoHideMenuBar: true,
            backgroundColor: '#1B1B1B',
            webPreferences: {
              partition,
              preload: join(__dirname, '../preload/webPanelPopup.js'),
              nodeIntegration: false,
              contextIsolation: false,
              sandbox: false
            }
          });
          popup.webContents.setUserAgent(CHROME_USER_AGENT);
          // Don't close popup immediately — let callback page load and process auth code
          let googleLoginDone = false;
          popup.webContents.on('did-navigate', (_e, popupUrl) => {
            try {
              if (new URL(popupUrl).hostname !== 'accounts.google.com') {
                googleLoginDone = true;
              }
            } catch { /* */ }
          });
          popup.webContents.on('did-finish-load', () => {
            if (!googleLoginDone) return;
            // Callback page loaded — wait for SPA to process auth code, then close
            setTimeout(() => {
              if (!popup.isDestroyed()) popup.close();
            }, 2000);
          });
          popup.on('closed', () => {
            setTimeout(() => {
              if (!view.webContents.isDestroyed()) view.webContents.reload();
            }, 800);
          });
          popup.loadURL(url);
          return { action: 'deny' };
        }
      } catch { /* not a valid URL */ }

      const isDialog = /\bwidth\s*=\s*\d+|\bheight\s*=\s*\d+/i.test(features);
      if (!isDialog) {
        view.webContents.loadURL(url).catch(() => undefined);
        return { action: 'deny' };
      }

      const currentOrigin = (() => {
        try { return new URL(view.webContents.getURL()).origin; } catch { return ''; }
      })();
      const isCrossOrigin = (() => {
        try { return new URL(url).origin !== currentOrigin; } catch { return true; }
      })();

      if (isCrossOrigin) {
        return {
          action: 'allow',
          overrideBrowserWindowOptions: {
            width: 520,
            height: 600,
            autoHideMenuBar: true,
            backgroundColor: '#1B1B1B',
            webPreferences: {
              partition,
              preload: join(__dirname, '../preload/webPanelPopup.js'),
              nodeIntegration: false,
              contextIsolation: false,
              sandbox: false
            }
          }
        };
      }

      return {
        action: 'allow',
        overrideBrowserWindowOptions: {
          width: 520,
          height: 600,
          autoHideMenuBar: true,
          backgroundColor: '#1B1B1B',
          webPreferences: {
            partition,
            preload: join(__dirname, '../preload/webPanelPopup.js'),
            nodeIntegration: false,
            contextIsolation: false,
            sandbox: false
          }
        }
      };
    });

    view.webContents.on('did-create-window', (popup) => {
      popup.webContents.setUserAgent(CHROME_USER_AGENT);

      const mainOrigin = (() => {
        try { return new URL(view.webContents.getURL()).origin; } catch { return ''; }
      })();
      let isCrossOrigin = false;
      popup.webContents.on('did-navigate', (_e, u) => {
        try { if (new URL(u).origin !== mainOrigin) isCrossOrigin = true; } catch { /* */ }
      });
      popup.on('closed', () => {
        if (!isCrossOrigin) return;
        setTimeout(() => {
          if (!view.webContents.isDestroyed()) view.webContents.reload();
        }, 800);
      });
    });

    this.views.set(descriptor.id, view);
    this.meta.set(descriptor.id, {
      defaultUserAgent: view.webContents.getUserAgent()
    });

    view.webContents.insertCSS('*,*::before,*::after{cursor:default!important}');

    this.bindViewEvents(descriptor.id, view);
    this.applyViewPreferences(descriptor.id, view, descriptor.web);

    if (descriptor.web?.url) {
      void this.getPanelSession(descriptor.id).cookies.flushStore();
      view.webContents.loadURL(descriptor.web.url).catch((error) => {
        logger.warn(`Failed to load panel URL for ${descriptor.id}`, error);
      });
    }

    return view;
  }

  getView(panelId: string | null): WebContentsView | null {
    if (!panelId) {
      return null;
    }

    return this.views.get(panelId) ?? null;
  }

  getCurrentUrl(panelId: string | null, fallbackUrl: string): string {
    const view = this.getView(panelId);
    return view?.webContents.getURL() || fallbackUrl;
  }

  async getMenuState(panelId: string): Promise<PanelMenuState | null> {
    const config = await this.getFreshConfig();
    const descriptor = config.panels.find((panel) => panel.id === panelId);
    if (!descriptor?.web) {
      return null;
    }

    return {
      panelId,
      title: descriptor.title,
      currentUrl: this.getCurrentUrl(panelId, descriptor.web.url),
      userAgentMode: descriptor.web.userAgentMode,
      notificationsSnoozed: descriptor.web.notificationsSnoozed ?? false,
      canOpenExternal: true
    };
  }

  async reload(panelId: string): Promise<PanelMenuState | null> {
    this.getView(panelId)?.webContents.reload();
    return this.getMenuState(panelId);
  }

  async copyLink(panelId: string): Promise<PanelMenuState | null> {
    const state = await this.getMenuState(panelId);
    if (!state) {
      return null;
    }

    clipboard.writeText(state.currentUrl);
    return state;
  }

  async toggleMobileView(panelId: string): Promise<PanelMenuState | null> {
    const config = await this.getFreshConfig();
    const descriptor = config.panels.find((panel) => panel.id === panelId);
    if (!descriptor?.web) {
      return null;
    }

    const nextMode = descriptor.web.userAgentMode === 'mobile' ? 'desktop' : 'mobile';
    const nextConfig = await this.updatePanelWebConfig(panelId, {
      userAgentMode: nextMode
    });
    const nextDescriptor = nextConfig.panels.find((panel) => panel.id === panelId);
    const view = this.getView(panelId);
    if (view && nextDescriptor?.web) {
      this.applyViewPreferences(panelId, view, nextDescriptor.web);
      view.webContents.reload();
    }

    return this.getMenuState(panelId);
  }

  async toggleNotificationsSnooze(panelId: string): Promise<PanelMenuState | null> {
    const config = await this.getFreshConfig();
    const descriptor = config.panels.find((panel) => panel.id === panelId);
    if (!descriptor?.web) {
      return null;
    }

    await this.updatePanelWebConfig(panelId, {
      notificationsSnoozed: !(descriptor.web.notificationsSnoozed ?? false)
    });

    return this.getMenuState(panelId);
  }

  async clearSiteData(panelId: string): Promise<PanelMenuState | null> {
    const config = await this.getFreshConfig();
    const descriptor = config.panels.find((panel) => panel.id === panelId);
    if (!descriptor?.web) {
      return null;
    }

    const currentUrl = this.getCurrentUrl(panelId, descriptor.web.url);
    const origin = new URL(currentUrl).origin;

    const ses = this.getPanelSession(panelId);
    await ses.clearStorageData({ origin });
    await ses.cookies.flushStore();
    this.getView(panelId)?.webContents.reload();

    return this.getMenuState(panelId);
  }

  async getSiteInfo(panelId: string): Promise<SiteInfo | null> {
    const config = await this.getFreshConfig();
    const descriptor = config.panels.find((panel) => panel.id === panelId);
    if (!descriptor?.web) {
      return null;
    }

    const currentUrl = this.getCurrentUrl(panelId, descriptor.web.url);
    const ses = this.getPanelSession(panelId);
    const cookies = await ses.cookies.get({ url: currentUrl }).catch(() => []);
    const cacheSizeBytes = await ses.getCacheSize().catch(() => 0);

    return {
      panelId,
      title: descriptor.title,
      currentUrl,
      userAgentMode: descriptor.web.userAgentMode,
      notificationsSnoozed: descriptor.web.notificationsSnoozed ?? false,
      cookieCount: cookies.length,
      cacheSizeBytes,
      customIconPath:
        descriptor.iconSource.kind === 'custom' ? descriptor.iconSource.path : undefined
    };
  }

  async openExternal(panelId: string, requestedUrl?: string): Promise<void> {
    const config = await this.getFreshConfig();
    const descriptor = config.panels.find((panel) => panel.id === panelId);
    if (!descriptor?.web) {
      return;
    }

    const targetUrl = requestedUrl || this.getCurrentUrl(panelId, descriptor.web.url);
    const browserTarget = descriptor.web.openInBrowser || 'system';

    if (browserTarget === 'system') {
      await shell.openExternal(targetUrl);
      return;
    }

    try {
      const executablePath = await this.browserService.resolveExecutable(browserTarget);
      if (!executablePath) {
        throw new Error(`Browser executable not found for ${browserTarget}`);
      }

      const child = spawn(executablePath, [targetUrl], {
        detached: true,
        stdio: 'ignore'
      });
      child.unref();
    } catch (error) {
      logger.warn(`Failed to launch configured browser for ${panelId}, falling back to system`, error);
      await shell.openExternal(targetUrl);
    }
  }

  async goBack(panelId: string): Promise<void> {
    const view = this.getView(panelId);
    if (!view || !view.webContents.canGoBack()) {
      return;
    }

    view.webContents.goBack();
  }

  async handleZoomChanged(panelId: string): Promise<void> {
    const view = this.getView(panelId);
    if (!view) {
      return;
    }

    await this.updatePanelWebConfig(panelId, {
      zoomFactor: Number(view.webContents.getZoomFactor().toFixed(2))
    });
  }

  applyMuteState(panelId: string | null, muted: boolean): void {
    this.getView(panelId)?.webContents.setAudioMuted(muted);
  }

  destroyView(panelId: string): void {
    const view = this.views.get(panelId);
    if (!view) {
      return;
    }

    if (!view.webContents.isDestroyed()) {
      view.webContents.close({ waitForBeforeUnload: false });
    }

    this.views.delete(panelId);
    this.meta.delete(panelId);
    this.partitions.delete(panelId);
  }

  private async getFreshConfig(): Promise<AppConfig> {
    const config = await this.dependencies.readConfig();
    this.currentConfig = config;
    return config;
  }

  private async updatePanelWebConfig(panelId: string, patch: Partial<WebPanelConfig>): Promise<AppConfig> {
    const config = await this.getFreshConfig();
    const nextPanels = config.panels.map((panel) =>
      panel.id === panelId && panel.web
        ? {
            ...panel,
            web: {
              ...panel.web,
              ...patch
            }
          }
        : panel
    );

    const nextConfig = await this.dependencies.updateConfig({ panels: nextPanels });
    this.currentConfig = nextConfig;
    return nextConfig;
  }

  private bindViewEvents(panelId: string, view: WebContentsView): void {
    // Google login pages don't use window.open — they navigate directly.
    // Intercept and open in a popup with full anti-detection preload.
    view.webContents.on('will-navigate', (event, url) => {
      try {
        if (new URL(url).hostname === 'accounts.google.com') {
          event.preventDefault();
          // Restore main view content — preventDefault() leaves it in transitional state
          const currentUrl = view.webContents.getURL();
          if (currentUrl) {
            view.webContents.loadURL(currentUrl).catch(() => undefined);
          }
          const popup = new BrowserWindow({
            width: 520,
            height: 600,
            autoHideMenuBar: true,
            backgroundColor: '#1B1B1B',
            webPreferences: {
              partition: this.partitions.get(panelId) ?? SHARED_PARTITION,
              preload: join(__dirname, '../preload/webPanelPopup.js'),
              nodeIntegration: false,
              contextIsolation: false,
              sandbox: false
            }
          });
          popup.webContents.setUserAgent(CHROME_USER_AGENT);
          // Don't close popup immediately — let callback page load and process auth code
          let googleLoginDone = false;
          popup.webContents.on('did-navigate', (_e, popupUrl) => {
            try {
              if (new URL(popupUrl).hostname !== 'accounts.google.com') {
                googleLoginDone = true;
              }
            } catch { /* */ }
          });
          popup.webContents.on('did-finish-load', () => {
            if (!googleLoginDone) return;
            // Callback page loaded — wait for SPA to process auth code, then close
            setTimeout(() => {
              if (!popup.isDestroyed()) popup.close();
            }, 2000);
          });
          popup.on('closed', () => {
            setTimeout(() => {
              if (!view.webContents.isDestroyed()) view.webContents.reload();
            }, 800);
          });
          popup.loadURL(url);
        }
      } catch { /* ignore */ }
    });

    view.webContents.on('did-navigate', (_event, url) => {
      this.emitNavigationState(panelId, view, url);
    });

    view.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame) {
        this.emitNavigationState(panelId, view, url);
      }
    });

    view.webContents.on('did-finish-load', () => {
      this.emitNavigationState(panelId, view);
    });

    view.webContents.on('zoom-changed', () => {
      void this.handleZoomChanged(panelId);
    });
  }

  private emitNavigationState(panelId: string, view: WebContentsView, url?: string): void {
    const emit = (): void => {
      if (view.webContents.isDestroyed()) {
        return;
      }

      try {
        this.dependencies.emitNavigation({
          panelId,
          url: url || view.webContents.getURL(),
          canGoBack: view.webContents.canGoBack()
        });
      } catch {
        // emitNavigation may fail if PanelManager is mid-destroy
      }
    };

    emit();
    setTimeout(emit, 80);
  }

  private applyViewPreferences(
    panelId: string,
    view: WebContentsView,
    webConfig?: WebPanelConfig
  ): void {
    if (!webConfig) {
      return;
    }

    const defaultUserAgent = this.meta.get(panelId)?.defaultUserAgent ?? view.webContents.getUserAgent();
    const nextUserAgent =
      webConfig.userAgentMode === 'mobile' ? MOBILE_USER_AGENT : defaultUserAgent;

    view.webContents.setUserAgent(nextUserAgent);
    view.webContents.setZoomFactor(webConfig.zoomFactor || 1);
  }

  private ensureSessionHandlers(partition: string): void {
    if (this.sessionsWithHandlers.has(partition)) return;
    this.sessionsWithHandlers.add(partition);

    const ses = session.fromPartition(partition, { cache: true });

    ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
      if (permission !== 'notifications') return false;
      return this.isNotificationAllowed(requestingOrigin);
    });

    ses.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission !== 'notifications') { callback(false); return; }
      callback(this.isNotificationAllowed(webContents.getURL()));
    });

    ses.webRequest.onBeforeSendHeaders(
      { urls: ['https://accounts.google.com/*', 'https://*.google.com/*', 'https://google.com/*'] },
      (details, callback) => {
        delete details.requestHeaders['Sec-Ch-Ua'];
        delete details.requestHeaders['Sec-Ch-Ua-Mobile'];
        delete details.requestHeaders['Sec-Ch-Ua-Platform'];
        details.requestHeaders['Sec-Fetch-Dest'] = 'document';
        details.requestHeaders['User-Agent'] = CHROME_USER_AGENT;
        callback({ requestHeaders: details.requestHeaders });
      }
    );

    ses.on('will-download', (_event, item) => {
      const savePath = join(app.getPath('downloads'), item.getFilename());
      item.setSavePath(savePath);
      new Notification({ title: 'SideBar', body: `开始下载 ${item.getFilename()}` }).show();
      item.once('done', (_downloadEvent, state) => {
        if (state === 'completed') {
          const n = new Notification({ title: 'SideBar', body: `${item.getFilename()} 下载完成` });
          n.on('click', () => shell.showItemInFolder(savePath));
          n.show();
        } else {
          new Notification({ title: 'SideBar', body: `${item.getFilename()} 下载失败` }).show();
        }
      });
    });
  }

  private getPanelSession(panelId: string): Electron.Session {
    const partition = this.partitions.get(panelId);
    if (partition && partition !== SHARED_PARTITION) {
      return session.fromPartition(partition, { cache: true });
    }
    return this.sharedSession;
  }

  private isNotificationAllowed(originOrUrl: string): boolean {
    const config = this.currentConfig;
    if (!config) {
      return true;
    }

    try {
      const origin = new URL(originOrUrl).origin;
      const descriptor = config.panels.find((panel) => {
        if (!panel.web?.url) {
          return false;
        }

        try {
          return new URL(panel.web.url).origin === origin;
        } catch {
          return false;
        }
      });

      return !(descriptor?.web?.notificationsSnoozed ?? false);
    } catch {
      return true;
    }
  }
}
