import { app, BrowserWindow, clipboard, ipcMain, Notification, session, shell, WebContentsView } from 'electron';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import type {
  AppConfig,
  PanelDescriptor,
  PanelLoadingPayload,
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

const resolvePartition = (descriptor: PanelDescriptor): string => {
  const web = descriptor.web;
  if (!web) return SHARED_PARTITION;

  if (web.sessionGroup === '__isolated__') {
    return `persist:panel-${descriptor.id}`;
  }
  if (web.sessionGroup) {
    return `persist:group-${web.sessionGroup}`;
  }

  if (web.isolatedSession) {
    return `persist:panel-${descriptor.id}`;
  }

  return SHARED_PARTITION;
};

interface WebPanelHostDependencies {
  readConfig: () => Promise<AppConfig>;
  updateConfig: (patch: Partial<AppConfig>) => Promise<AppConfig>;
  emitNavigation: (payload: PanelNavigationPayload) => void;
  emitLoading: (payload: PanelLoadingPayload) => void;
}

interface ViewMeta {
  defaultUserAgent: string;
}

const MAX_CACHED_VIEWS = 8;

export class WebPanelHost {
  private readonly views = new Map<string, WebContentsView>();
  private readonly meta = new Map<string, ViewMeta>();
  private readonly partitions = new Map<string, string>();
  private readonly lastGoodUrls = new Map<string, string>();
  // LRU order: most-recently-used last
  private readonly lruOrder: string[] = [];
  private readonly sharedSession = session.fromPartition(SHARED_PARTITION, { cache: true });
  private readonly browserService = new BrowserService();
  private currentConfig: AppConfig | null = null;
  private readonly sessionsWithHandlers = new Set<string>();
  private readonly popupWebContentsIds = new Set<number>();
  private readonly panelUrls = new Map<string, string>();
  private readonly popupParentMap = new Map<number, string>(); // popup wcId → parent panelId

  constructor(private readonly dependencies: WebPanelHostDependencies) {
    this.ensureSessionHandlers(SHARED_PARTITION);
    void this.refreshConfig();

    // IPC: popup preload requests parent URL for window.opener.location
    ipcMain.on('get-parent-url', (event) => {
      const wcId = event.sender.id;
      const panelId = this.popupParentMap.get(wcId);
      if (panelId) {
        const view = this.views.get(panelId);
        if (view && !view.webContents.isDestroyed()) {
          event.returnValue = view.webContents.getURL();
          return;
        }
      }
      event.returnValue = '';
    });

    // IPC: popup preload sends GIS credential → forward to parent panel
    ipcMain.on('google-login-credential', (_event, data) => {
      const wcId = _event.sender.id;
      const panelId = this.popupParentMap.get(wcId);
      logger.info('[GoogleLogin] Credential received via IPC', {
        panelId,
        wcId,
        dataType: typeof data,
        keys: data && typeof data === 'object' ? Object.keys(data) : undefined
      });

      if (panelId) {
        const view = this.views.get(panelId);
        if (view && !view.webContents.isDestroyed()) {
          // GIS sends the credential as a JSON string via postMessage.
          // We must preserve the original type — passing it through
          // JSON.parse+stringify would inject an object literal into
          // executeJavaScript, but GIS expects event.data to be a string
          // (it does JSON.parse(event.data) internally).
          const escaped = JSON.stringify(data);

          view.webContents.executeJavaScript(`
            if (typeof window.__googleLoginReceive === 'function') {
              window.__googleLoginReceive(${escaped});
            }
          `).then(() => logger.info('[GoogleLogin] __googleLoginReceive OK'))
            .catch((e) => logger.info(`[GoogleLogin] __googleLoginReceive failed: ${e}`));
        }
      }
    });
  }

  async refreshConfig(): Promise<void> {
    this.currentConfig = await this.dependencies.readConfig();
  }

  getOrCreateView(descriptor: PanelDescriptor): WebContentsView {
    const partition = resolvePartition(descriptor);

    const existing = this.views.get(descriptor.id);
    if (existing) {
      // Recreate view if session isolation setting changed
      if (this.partitions.get(descriptor.id) !== partition) {
        this.destroyView(descriptor.id);
      } else {
        this.touchLru(descriptor.id);
        this.applyViewPreferences(descriptor.id, existing, descriptor.web);
        return existing;
      }
    }

    const view = new WebContentsView({
      webPreferences: {
        partition,
        preload: join(__dirname, '../preload/webPanel.js'),
        nodeIntegration: false,
        contextIsolation: false,
        sandbox: false
      } as Electron.WebPreferences
    });

    this.partitions.set(descriptor.id, partition);
    if (descriptor.web?.url) {
      this.panelUrls.set(descriptor.id, descriptor.web.url);
    }
    this.ensureSessionHandlers(partition);

    view.webContents.setBackgroundThrottling(false);
    view.webContents.setVisualZoomLevelLimits(1, 3).catch(() => undefined);
    view.webContents.setWindowOpenHandler(({ url, features }) => {
      // Google login — use parent's partition so window.opener.postMessage
      // reaches the parent (different partitions = isolated JS contexts in
      // Chromium, breaking the GIS callback flow).
      try {
        if (new URL(url).hostname === 'accounts.google.com') {
          return {
            action: 'allow',
            overrideBrowserWindowOptions: {
              width: 520,
              height: 600,
              autoHideMenuBar: true,
              backgroundColor: '#1B1B1B',
              webPreferences: {
                partition,
                preload: join(__dirname, '../preload/googleLogin.js'),
                nodeIntegration: false,
                contextIsolation: false,
                sandbox: false
              }
            }
          };
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
      // Capture ID immediately — popup.webContents is inaccessible after destroy
      const popupId = popup.webContents.id;
      const popupSession = popup.webContents.session;

      // Track popup → parent panel for IPC credential forwarding
      this.popupParentMap.set(popupId, descriptor.id);

      // Suppress error dialogs from popup renderers
      popup.webContents.on('render-process-gone', (_e, details) => {
        logger.info(`[Popup] render-process-gone: ${details.reason}`);
      });
      popup.webContents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL) => {
        if (errorCode === -3) return; // ERR_ABORTED — expected from redirects
        logger.info(`[Popup] did-fail-load: ${errorDescription} url=${validatedURL}`);
      });

      // Relay popup console to main process log
      popup.webContents.on('console-message', (_e, _level, message) => {
        logger.info(`[Popup:console] ${message}`);
      });

      // Track popup so onBeforeRequest allows its Google requests through
      this.popupWebContentsIds.add(popupId);
      popup.on('closed', () => {
        this.popupWebContentsIds.delete(popupId);
        this.popupParentMap.delete(popupId);
      });

      let isGoogleLogin = false;
      let closeTimer: ReturnType<typeof setTimeout> | null = null;

      const checkCallback = (url: string) => {
        try {
          const host = new URL(url).hostname;
          if (!host.endsWith('.google.com') && host !== 'google.com') {
            isGoogleLogin = true;
          }
        } catch { /* */ }
      };

      popup.webContents.on('did-navigate', (_e, u) => checkCallback(u));
      popup.webContents.on('did-navigate-in-page', (_e, u) => checkCallback(u));

      popup.webContents.on('did-finish-load', () => {
        if (!isGoogleLogin) {
          try {
            const currentUrl = popup.webContents.getURL();
            checkCallback(currentUrl);
          } catch { /* */ }
        }
        if (!isGoogleLogin) return;
        if (closeTimer) clearTimeout(closeTimer);
        logger.info('[Popup] Callback page loaded (did-create-window), resetting 8s close timer');
        closeTimer = setTimeout(async () => {
          if (popup.isDestroyed()) return;
          try {
            await Promise.race([
              popupSession.cookies.flushStore(),
              new Promise(r => setTimeout(r, 3000))
            ]);
          } catch { /* */ }
          popup.close();
        }, 8000);
      });

      popup.on('closed', () => {
        this.popupWebContentsIds.delete(popupId);
        // Reload parent so it picks up the new Google auth state.
        // 3s delay gives the GIS credential handler time to exchange
        // the token with the backend and set the session cookie.
        if (view && !view.webContents.isDestroyed()) {
          setTimeout(() => {
            if (view.webContents.isDestroyed()) return;
            const reloadUrl = this.panelUrls.get(descriptor.id);
            if (reloadUrl) {
              view.webContents.loadURL(reloadUrl).catch(() => undefined);
            } else {
              view.webContents.reload();
            }
          }, 3000);
        }
      });
    });

    this.views.set(descriptor.id, view);
    this.meta.set(descriptor.id, {
      defaultUserAgent: view.webContents.getUserAgent()
    });
    this.touchLru(descriptor.id);
    this.evictLru();

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
    this.lastGoodUrls.delete(panelId);
    this.panelUrls.delete(panelId);
    const idx = this.lruOrder.indexOf(panelId);
    if (idx !== -1) this.lruOrder.splice(idx, 1);
  }

  private touchLru(panelId: string): void {
    const idx = this.lruOrder.indexOf(panelId);
    if (idx !== -1) this.lruOrder.splice(idx, 1);
    this.lruOrder.push(panelId);
  }

  private evictLru(): void {
    while (this.views.size > MAX_CACHED_VIEWS) {
      const victim = this.lruOrder[0];
      if (!victim) break;
      logger.info(`WebPanelHost: evicting LRU view ${victim}`);
      this.destroyView(victim);
    }
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
    // will-navigate fallback — onBeforeRequest is the primary interception,
    // but will-navigate catches cached navigations that skip the network layer.
    view.webContents.on('will-navigate', (event, url) => {
      try {
        if (new URL(url).hostname === 'accounts.google.com') {
          event.preventDefault();
          // Restore page immediately — preventDefault() may leave it in broken state
          const restoreUrl = this.lastGoodUrls.get(panelId);
          if (restoreUrl) {
            view.webContents.loadURL(restoreUrl).catch(() => undefined);
          }
          this.openGoogleLoginPopup(
            url,
            this.partitions.get(panelId) ?? SHARED_PARTITION,
            view,
            this.panelUrls.get(panelId),
            panelId
          );
        }
      } catch { /* ignore */ }
    });

    view.webContents.on('did-navigate', (_event, url) => {
      try {
        if (new URL(url).hostname !== 'accounts.google.com') {
          this.lastGoodUrls.set(panelId, url);
        }
      } catch { /* */ }
      this.emitNavigationState(panelId, view, url);
    });

    view.webContents.on('did-navigate-in-page', (_event, url, isMainFrame) => {
      if (isMainFrame) {
        try {
          if (new URL(url).hostname !== 'accounts.google.com') {
            this.lastGoodUrls.set(panelId, url);
          }
        } catch { /* */ }
        this.emitNavigationState(panelId, view, url);
      }
    });

    view.webContents.on('did-finish-load', () => {
      this.emitNavigationState(panelId, view);
    });

    view.webContents.on('did-start-loading', () => {
      this.dependencies.emitLoading({ panelId, isLoading: true });
    });

    view.webContents.on('did-stop-loading', () => {
      this.dependencies.emitLoading({ panelId, isLoading: false });
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

  private openGoogleLoginPopup(
    url: string,
    panelPartition: string,
    parentView: WebContentsView | null,
    fallbackUrl?: string,
    panelId?: string
  ): BrowserWindow {
    logger.info(`[GoogleLogin] Opening popup panelPartition=${panelPartition} fallbackUrl=${fallbackUrl ?? 'none'}`);

    // Use parent's partition so window.opener.postMessage reaches the parent.
    const popup = new BrowserWindow({
      width: 520,
      height: 600,
      autoHideMenuBar: true,
      backgroundColor: '#1B1B1B',
      webPreferences: {
        partition: panelPartition,
        preload: join(__dirname, '../preload/googleLogin.js'),
        nodeIntegration: false,
        contextIsolation: false,
        sandbox: false
      }
    });

    // Capture ID/session immediately — popup.webContents is inaccessible after destroy
    const popupId = popup.webContents.id;
    const popupSession = popup.webContents.session;
    logger.info(`[GoogleLogin] Popup created id=${popupId} sessionPartition=${panelPartition}`);

    // Track popup → parent panel for IPC credential forwarding
    if (panelId) {
      this.popupParentMap.set(popupId, panelId);
    }

    // Track popup so onBeforeRequest allows its Google requests through
    this.popupWebContentsIds.add(popupId);

    // Relay popup console to main process log
    popup.webContents.on('console-message', (_e, _level, message) => {
      logger.info(`[Popup:console] ${message}`);
    });
    popup.on('closed', () => {
      this.popupWebContentsIds.delete(popupId);
      this.popupParentMap.delete(popupId);
      logger.info(`[GoogleLogin] Popup closed id=${popupId}`);
      if (parentView && !parentView.webContents.isDestroyed()) {
        setTimeout(async () => {
          if (parentView.webContents.isDestroyed()) return;

          if (fallbackUrl) {
            logger.info(`[GoogleLogin] Loading fallbackUrl=${fallbackUrl}`);
            parentView.webContents.loadURL(fallbackUrl).catch(() => undefined);
          } else {
            logger.info('[GoogleLogin] Reloading parent');
            parentView.webContents.reload();
          }
        }, 3000);
      }
    });

    popup.webContents.setUserAgent(CHROME_USER_AGENT);

    let callbackReached = false;
    const checkCallback = (url: string) => {
      try {
        const host = new URL(url).hostname;
        if (!host.endsWith('.google.com') && host !== 'google.com') {
          if (!callbackReached) {
            callbackReached = true;
            logger.info('[GoogleLogin] Callback URL detected, will auto-close after 8s');
          }
        }
      } catch { /* */ }
    };
    popup.webContents.on('did-navigate', (_e, popupUrl) => {
      logger.info(`[GoogleLogin] Popup navigated to: ${popupUrl}`);
      checkCallback(popupUrl);
    });
    popup.webContents.on('did-navigate-in-page', (_e, popupUrl) => checkCallback(popupUrl));
    let closeTimer: ReturnType<typeof setTimeout> | null = null;
    popup.webContents.on('did-finish-load', () => {
      if (!callbackReached) {
        try { checkCallback(popup.webContents.getURL()); } catch { /* */ }
      }
      if (!callbackReached) return;
      if (closeTimer) clearTimeout(closeTimer);
      logger.info('[GoogleLogin] Callback page loaded, resetting 8s auto-close timer');
      closeTimer = setTimeout(async () => {
        if (popup.isDestroyed()) return;
        try {
          await Promise.race([
            popupSession.cookies.flushStore(),
            new Promise(r => setTimeout(r, 3000))
          ]);
          logger.info('[GoogleLogin] Cookie store flushed');
        } catch (e) {
          logger.info(`[GoogleLogin] Cookie flush failed: ${e}`);
        }
        popup.close();
      }, 8000);
    });

    popup.loadURL(url);
    return popup;
  }

  private ensureSessionHandlers(partition: string): void {
    if (this.sessionsWithHandlers.has(partition)) return;
    this.sessionsWithHandlers.add(partition);

    const ses = session.fromPartition(partition, { cache: true });

    // Intercept main-frame navigations to Google login BEFORE page loads.
    // Unlike will-navigate, this fires at the HTTP request level, so the page
    // never starts loading the Google URL (no error flash).
    // Popup windows are tracked separately so their Google requests pass through.
    ses.webRequest.onBeforeRequest(
      { urls: ['https://accounts.google.com/*'] },
      (details, callback) => {
        if (details.resourceType !== 'mainFrame' || !details.webContents) {
          callback({});
          return;
        }

        const entry = [...this.views.entries()].find(
          ([, v]) => v.webContents.id === details.webContents!.id
        );

        // Only intercept navigations from known panel views.
        // Popups (including Google login) aren't in this.views, so their
        // requests pass through — no need to track popup IDs separately.
        if (!entry) {
          callback({});
          return;
        }

        const panelId = entry[0];
        const parentView = entry[1];
        logger.info('[onBeforeRequest] Google redirect intercepted', { panelId, partition, panelUrl: panelId ? this.panelUrls.get(panelId) : undefined });

        this.openGoogleLoginPopup(
          details.url,
          partition,
          parentView,
          panelId ? this.panelUrls.get(panelId) : undefined,
          panelId
        );
        callback({ cancel: true });

        // Restore panel to last good URL so reload() after popup close
        // doesn't retry the cancelled redirect target.
        if (panelId && parentView && !parentView.webContents.isDestroyed()) {
          const restoreUrl = this.lastGoodUrls.get(panelId);
          if (restoreUrl) {
            parentView.webContents.loadURL(restoreUrl).catch(() => undefined);
          }
        }
      }
    );

    ses.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
      if (permission !== 'notifications') return false;
      return this.isNotificationAllowed(requestingOrigin);
    });

    ses.setPermissionRequestHandler((webContents, permission, callback) => {
      if (permission !== 'notifications') { callback(false); return; }
      callback(this.isNotificationAllowed(webContents.getURL()));
    });

    // Temporarily disabled to test if header modification causes Google login failure
    // ses.webRequest.onBeforeSendHeaders(
    //   { urls: ['https://accounts.google.com/*', 'https://*.google.com/*', 'https://google.com/*'] },
    //   (details, callback) => {
    //     delete details.requestHeaders['Sec-Ch-Ua'];
    //     delete details.requestHeaders['Sec-Ch-Ua-Mobile'];
    //     delete details.requestHeaders['Sec-Ch-Ua-Platform'];
    //     details.requestHeaders['User-Agent'] = CHROME_USER_AGENT;
    //     callback({ requestHeaders: details.requestHeaders });
    //   }
    // );

    // Strip Cross-Origin-Opener-Policy from Google responses so the popup's
    // window.opener.postMessage() can reach the parent panel.
    // Google sends COOP: same-origin which severs the opener relationship.
    ses.webRequest.onHeadersReceived(
      { urls: ['https://accounts.google.com/*', 'https://*.google.com/*'] },
      (details, callback) => {
        const h = details.responseHeaders;
        if (h) {
          delete h['cross-origin-opener-policy'];
          delete h['cross-origin-embedder-policy'];
        }
        callback({ responseHeaders: h });
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
