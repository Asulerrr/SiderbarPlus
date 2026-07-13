import { BrowserWindow, screen } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type {
  AppConfig,
  PanelResizeStartPayload,
  PanelState,
  PanelsUpdatedPayload
} from '../../shared/types';
import type { ConfigStore } from '../store/ConfigStore';
import { PanelManager } from '../panels/PanelManager';
import { AppBarService } from '../services/AppBarService';
import { getDockBounds, getTargetDisplay } from '../utils/display';
import { getPreferredPanelWidth, getPanelBounds, percentToPanelPx } from '../utils/panelBounds';
import { logger } from '../utils/logger';
import { PanelAnimationWindow } from './PanelAnimationWindow';
import { DockWindow } from './DockWindow';
import { PanelMenuWindow } from './PanelMenuWindow';
import { PanelWindow } from './PanelWindow';
import { DockGeometryStabilizer } from './dockGeometryStabilizer';

const DOCK_APPBAR_ID = 'dock';
const PANEL_APPBAR_ID = 'panel';

/** 创建一个隐藏锚点窗口，用于 AppBar 占位而不影响真实 UI 窗口 */
const createAppBarAnchor = (dipRect: {
  x: number;
  y: number;
  width: number;
  height: number;
}): BrowserWindow => {
  return new BrowserWindow({
    ...dipRect,
    show: false,
    frame: false,
    transparent: true,
    type: 'toolbar',
    skipTaskbar: true,
    resizable: false,
    movable: false,
    focusable: false,
    hasShadow: false,
    thickFrame: false,
    roundedCorners: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true
    }
  });
};

export class WindowManager {
  private dockWindow: DockWindow | null = null;
  private panelWindow: PanelWindow | null = null;
  private panelAnimationWindow: PanelAnimationWindow | null = null;
  private panelMenuWindow: PanelMenuWindow | null = null;
  private panelManager: PanelManager | null = null;
  private readonly appBarService = new AppBarService();
  private readonly dockGeometryStabilizer = new DockGeometryStabilizer();

  /** 隐藏锚点窗口——仅用于 AppBar 注册，绝不显示 */
  private dockAnchor: BrowserWindow | null = null;
  private panelAnchor: BrowserWindow | null = null;
  private panelAnchorWidthDip = 0;
  private lastAssertAllMs = 0;
  private cachedWorkArea: { x: number; y: number; width: number; height: number } | null = null;

  private dockVisibleBeforeFullscreen: boolean | null = null;
  private lastPanelState: PanelState = {
    activePanelId: null,
    panelVisible: false,
    panelMode: 'hover',
    edge: 'right'
  };

  constructor(
    private config: AppConfig,
    private readonly configStore: ConfigStore,
    private readonly forwardPanelState: (state: PanelState) => void
  ) {
  }

  private handlePanelState = (state: PanelState): void => {
    this.lastPanelState = state;
    void this.syncPanelAppBar(state);
    this.forwardPanelState(state);
  };

  createWindows(): void {
    this.dockWindow = new DockWindow(this.config);
    this.panelWindow = new PanelWindow(this.config);
    this.panelAnimationWindow = new PanelAnimationWindow(this.config);
    this.panelMenuWindow = new PanelMenuWindow(() => {
      this.panelManager?.resumeHoverAfterMenuClose();
    });

    this.dockWindow.create();
    this.hookExplorerRestart();
    this.panelWindow.create();
    this.panelAnimationWindow.create();
    this.panelMenuWindow.create();
    this.panelManager = new PanelManager(
      this.configStore,
      this.panelWindow,
      this.panelAnimationWindow,
      this.panelMenuWindow,
      this.handlePanelState,
      this.dockWindow.getBrowserWindow()!
    );

    this.panelWindow.getBrowserWindow()?.on('blur', () => {
      this.panelManager?.handlePanelBlur();
    });

    this.lastPanelState = { ...this.lastPanelState, edge: this.config.layout.edge };
    if (this.config.app.autoShowDock) {
      const transition = this.dockWindow.beginGeometryTransition();
      this.dockWindow.show();
      this.registerDockAppBar();
      this.stabilizeDockGeometry(
        transition,
        this.config.layout.edge,
        this.config.layout.displayId
      );
    }
  }

  getDockWindow(): DockWindow | null {
    return this.dockWindow;
  }

  getPanelWindow(): PanelWindow | null {
    return this.panelWindow;
  }

  hideDockToTray(): void {
    this.dockWindow?.hide();
    this.panelWindow?.hide();
    this.panelMenuWindow?.hide();
    // Keep AppBar registered — prevents work area change when toggling,
    // which would push the always-on-top dock and cause position drift.
  }

  showDockFromTray(): void {
    this.dockWindow?.show();
  }

  activateExistingInstance(): void {
    this.dockWindow?.show();
    this.dockWindow?.getBrowserWindow()?.moveTop();
  }

  hideForFullscreen(): void {
    this.dockVisibleBeforeFullscreen = this.isDockVisible();
    this.panelManager?.forceCloseAndResetMode(
      this.lastPanelState.edge,
      this.config.layout.displayId
    );
    this.dockWindow?.hide();
  }

  restoreFromFullscreen(): void {
    if (this.dockVisibleBeforeFullscreen) {
      this.dockWindow?.show();
    }
    this.dockVisibleBeforeFullscreen = null;
  }

  applyEdgeChange(config: AppConfig): void {
    const edge = config.layout.edge;
    const displayId = config.layout.displayId ??
      screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
    const transition = this.dockWindow?.beginGeometryTransition();
    this.config = config;
    // Persist auto-detected displayId so registerDockAppBar uses the correct monitor
    this.config.layout.displayId = displayId;
    this.panelManager?.forceCloseAndResetMode(edge, displayId);
    this.lastPanelState = { ...this.lastPanelState, edge, panelMode: 'hover', activePanelId: null };
    this.forwardPanelState(this.lastPanelState);
    this.dockWindow?.updateConfig(config);
    this.dockWindow?.updateBounds(edge, displayId);
    const maxWidthPx = percentToPanelPx(
      config.layout.panelDefaultWidth,
      getTargetDisplay(displayId).workArea.width
    );
    this.panelWindow?.updateConfig(config);
    this.panelWindow?.updateBounds(edge, maxWidthPx, displayId);
    this.panelAnimationWindow?.updateConfig(config);
    this.panelAnimationWindow?.updateBounds(edge, maxWidthPx, displayId);
    this.unregisterPanelAppBar();
    this.registerDockAppBar();
    if (transition !== undefined) {
      this.stabilizeDockGeometry(transition, edge, displayId);
    }
  }

  toggleDockVisibility(): boolean {
    if (this.dockWindow?.isVisible()) {
      this.hideDockToTray();
      return false;
    }
    this.showDockFromTray();
    return true;
  }

  isDockVisible(): boolean {
    return this.dockWindow?.isVisible() ?? false;
  }

  async hoverPanel(panelId: string): Promise<void> {
    await this.panelManager?.hoverPanel(panelId);
  }

  async showPanel(panelId: string, sticky = false): Promise<void> {
    await this.panelManager?.showPanel(panelId, sticky);
  }

  scheduleHidePanel(destroy = false): void {
    this.panelManager?.scheduleHide(destroy);
  }

  muteHide(durationMs?: number): void {
    this.panelManager?.muteHide(durationMs);
  }

  clearHideMute(): void {
    this.panelManager?.clearHideMute();
  }

  cancelScheduledHide(): void {
    this.panelManager?.cancelScheduledHide();
  }

  async hidePanel(destroy = false): Promise<void> {
    await this.panelManager?.hidePanel(destroy);
  }

  async getPanelMenuState(panelId: string) {
    return this.panelManager?.getMenuState(panelId) ?? null;
  }

  notifyPanelsUpdated(payload: PanelsUpdatedPayload): void {
    this.dockWindow?.getBrowserWindow()?.webContents.send(IPC_CHANNELS.panelsUpdated, payload);
  }

  async runPanelMenuAction(
    panelId: string,
    action:
      | 'reload'
      | 'copy-link'
      | 'toggle-mobile-view'
      | 'toggle-notifications-snooze'
      | 'toggle-translate'
      | 'open-edit-site'
      | 'clear-site-data'
      | 'open-site-info'
  ) {
    return this.panelManager?.runMenuAction(panelId, action) ?? null;
  }

  async getSiteInfo(panelId: string) {
    return this.panelManager?.getSiteInfo(panelId) ?? null;
  }

  async openPanelExternal(panelId: string, url?: string): Promise<void> {
    await this.panelManager?.openExternal(panelId, url);
  }

  async goBackPanel(panelId: string): Promise<void> {
    await this.panelManager?.goBack(panelId);
  }

  async openPanelMenu(payload: import('../../shared/types').PanelMenuAnchor): Promise<void> {
    await this.panelManager?.openMenu(payload);
  }

  closePanelMenu(): void {
    this.panelManager?.closeMenu();
  }

  closePanelMenuAndResumeHover(): void {
    this.panelManager?.closeMenuAndResumeHover();
  }

  markPanelSticky(): void {
    this.panelManager?.markSticky();
  }

  getActivePanelId(): string | null {
    return this.panelManager?.getCurrentPanelId() ?? null;
  }

  destroyPanelView(panelId: string): void {
    this.panelManager?.destroyPanelView(panelId);
  }

  async clearAllWebStorageData(): Promise<void> {
    await this.panelManager?.clearAllWebStorageData();
  }

  async flushWebPanelCookies(): Promise<void> {
    await this.panelManager?.flushWebPanelCookies();
  }

  async togglePanelPin(): Promise<void> {
    await this.panelManager?.togglePin();
  }

  async togglePanelPinIfCursorOverPanel(): Promise<void> {
    const browserWindow = this.panelWindow?.getBrowserWindow();
    if (!browserWindow || browserWindow.isDestroyed()) return;
    const cursor = screen.getCursorScreenPoint();
    const bounds = browserWindow.getBounds();
    if (
      cursor.x >= bounds.x &&
      cursor.x <= bounds.x + bounds.width &&
      cursor.y >= bounds.y &&
      cursor.y <= bounds.y + bounds.height
    ) {
      await this.panelManager?.togglePin();
    }
  }

  startPanelResize(point: PanelResizeStartPayload): void {
    this.panelManager?.startNativeResize(point);
  }

  async reloadAfterImport(nextConfig: AppConfig): Promise<void> {
    this.dockGeometryStabilizer.cancel();
    this.unregisterAllAppBars();
    this.dockWindow?.getBrowserWindow()?.destroy();
    this.panelWindow?.destroy();
    this.panelAnimationWindow?.getBrowserWindow()?.destroy();
    this.panelMenuWindow?.getBrowserWindow()?.destroy();
    this.dockWindow = null;
    this.panelWindow = null;
    this.panelAnimationWindow = null;
    this.panelMenuWindow = null;
    this.panelManager = null;
    this.config = nextConfig;
    this.createWindows();
  }

  disposeAppBar(): void {
    this.dockGeometryStabilizer.cancel();
    // 仅调用 ABM_REMOVE，不销毁锚点窗口。
    // Windows 的 SHAppBarMessage(ABM_REMOVE) 需要窗口存活才能完成
    // work area 恢复消息投递——立即 destroy 会导致 WM_SETTINGCHANGE
    // 无法送达其它应用，work area 残留不释放。
    // 锚点窗口由进程退出时 OS 统一清理。
    this.appBarService.removeAll();
  }

  // ---------- AppBar（全部通过隐藏锚点实现）----------

  /** 创建或复用隐藏锚点并注册为 dock AppBar。 */
  private registerDockAppBar(): void {
    if (!this.appBarService.isAvailable()) return;
    const dockDip = getDockBounds(this.lastPanelState.edge, this.config.layout.displayId);

    // 为 DIP→物理转换找一个同屏窗口
    const refWin = this.dockWindow?.getBrowserWindow();
    if (!refWin) return;

    if (!this.dockAnchor || this.dockAnchor.isDestroyed()) {
      this.dockAnchor = createAppBarAnchor(dockDip);
    } else {
      this.dockAnchor.setBounds(dockDip);
    }

    const physical = screen.dipToScreenRect(refWin, dockDip);
    const handle = this.dockAnchor.getNativeWindowHandle();
    this.appBarService.register(DOCK_APPBAR_ID, handle, this.lastPanelState.edge, {
      x: physical.x,
      y: physical.y,
      width: physical.width,
      height: physical.height
    });
    logger.info('Dock AppBar anchor registered', { dockDip });

    const dockWin = this.dockWindow?.getBrowserWindow();
    if (dockWin && !dockWin.isDestroyed()) {
      dockWin.setBounds(dockDip);
    }
  }

  private stabilizeDockGeometry(
    transition: number,
    edge: AppConfig['layout']['edge'],
    displayId?: number
  ): void {
    const dockWindow = this.dockWindow;
    if (!dockWindow) return;

    this.dockGeometryStabilizer.start({
      isAtExpectedBounds: () => dockWindow.isAtBounds(edge, displayId),
      applyExpectedBounds: () => dockWindow.updateBounds(edge, displayId),
      finish: () => {
        if (dockWindow.finishGeometryTransition(transition)) {
          logger.info('Dock geometry transition finished', { edge, displayId });
        }
      }
    });
  }

  private hookExplorerRestart(): void {
    const message = this.appBarService.getTaskbarCreatedMessage();
    const dockBrowserWindow = this.dockWindow?.getBrowserWindow();
    if (!message || !dockBrowserWindow) return;

    dockBrowserWindow.hookWindowMessage(message, () => {
      const restoreDockAppBar = this.appBarService.isRegistered(DOCK_APPBAR_ID);
      this.appBarService.forgetRegistrations();
      if (!restoreDockAppBar) return;

      logger.info('Explorer restarted; restoring Dock AppBar');
      const edge = this.config.layout.edge;
      const displayId = this.config.layout.displayId;
      const transition = this.dockWindow?.beginGeometryTransition();
      this.dockWindow?.updateBounds(edge, displayId);
      this.registerDockAppBar();
      if (transition !== undefined) {
        this.stabilizeDockGeometry(transition, edge, displayId);
      }
    });
  }

  /** panel 不再独立注册 AppBar——仅需确保窗口位置正确 */
  private async syncPanelAppBar(state: PanelState): Promise<void> {
    if (!this.appBarService.isAvailable()) return;

    if (state.panelMode === 'pinned' && state.activePanelId) {
      this.assertAllVisibleWindows(true);
    } else {
      this.unregisterPanelAppBar();
    }
  }

  /** 校准 Dock 与当前可见面板的位置。 */
  private assertAllVisibleWindows(force = false): void {
    const now = Date.now();
    if (now - this.lastAssertAllMs < 80) return;
    this.lastAssertAllMs = now;

    const edge = this.lastPanelState.edge ?? this.config.layout.edge;
    const displayId = this.config.layout.displayId;

    const display = getTargetDisplay(displayId);
    const wa = display.workArea;
    if (!force) {
      // 仅在 work area 实际变化时才校准位置（截图/全屏等触发的 display-metrics-changed 不影响 work area）
      if (this.cachedWorkArea) {
        const c = this.cachedWorkArea;
        if (c.x === wa.x && c.y === wa.y && c.width === wa.width && c.height === wa.height) {
          return;
        }
      }
    }
    this.cachedWorkArea = { x: wa.x, y: wa.y, width: wa.width, height: wa.height };

    const dockBounds = getDockBounds(edge, displayId);
    const dockWin = this.dockWindow?.getBrowserWindow();
    if (dockWin && !dockWin.isDestroyed()) {
      const current = dockWin.getBounds();
      if (
        current.x !== dockBounds.x ||
        current.y !== dockBounds.y ||
        current.width !== dockBounds.width ||
        current.height !== dockBounds.height
      ) {
        dockWin.setBounds(dockBounds);
      }
    }

    if (this.lastPanelState.panelVisible) {
      this.panelWindow?.assertPosition();
      this.panelAnimationWindow?.assertPosition();
    }
  }

  private unregisterPanelAppBar(): void {
    this.appBarService.remove(PANEL_APPBAR_ID);
    if (this.panelAnchor && !this.panelAnchor.isDestroyed()) {
      this.panelAnchor.destroy();
      this.panelAnchor = null;
    }
    this.panelAnchorWidthDip = 0;
  }

  private unregisterAllAppBars(): void {
    this.appBarService.removeAll();
    if (this.dockAnchor && !this.dockAnchor.isDestroyed()) {
      this.dockAnchor.destroy();
      this.dockAnchor = null;
    }
    if (this.panelAnchor && !this.panelAnchor.isDestroyed()) {
      this.panelAnchor.destroy();
      this.panelAnchor = null;
    }
    this.panelAnchorWidthDip = 0;
  }
}
