import { BrowserWindow, screen } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { AppConfig, PanelState, PanelsUpdatedPayload } from '../../shared/types';
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
    // WM_SETTINGCHANGE / SPI_SETWORKAREA → Electron 触发此事件。
    // AppBar 注册/更新会收缩 work area，Chromium 可能在收到该消息后
    // 异步把 always-on-top 窗口 snap 进新 work area。
    // 监听此事件，一旦触发就重断言所有可见窗口位置。
    screen.on('display-metrics-changed', () => {
      this.assertAllVisibleWindows();
    });
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
    this.panelMenuWindow = new PanelMenuWindow();

    this.dockWindow.create();
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

    if (this.config.app.autoShowDock) {
      this.registerDockAppBar();
    }
    this.lastPanelState = { ...this.lastPanelState, edge: this.config.layout.edge };
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
    this.unregisterAllAppBars();
  }

  showDockFromTray(): void {
    this.dockWindow?.show();
    this.registerDockAppBar();
  }

  activateExistingInstance(): void {
    this.dockWindow?.show();
    this.dockWindow?.getBrowserWindow()?.moveTop();
  }

  hideForFullscreen(): void {
    this.dockVisibleBeforeFullscreen = this.isDockVisible();
    this.dockWindow?.hide();
    this.panelWindow?.hide();
    this.panelMenuWindow?.hide();
  }

  restoreFromFullscreen(): void {
    if (this.dockVisibleBeforeFullscreen) {
      this.dockWindow?.show();
    }
    this.dockVisibleBeforeFullscreen = null;
  }

  applyEdgeChange(config: AppConfig): void {
    const edge = config.layout.edge;
    const displayId = config.layout.displayId;
    this.config = config;
    this.panelManager?.forceCloseAndResetMode(edge, displayId);
    this.dockWindow?.updateConfig(config);
    this.dockWindow?.updateBounds(edge, displayId);
    const maxWidthPx = percentToPanelPx(
      config.layout.panelDefaultWidth,
      getTargetDisplay(displayId).workArea.width
    );
    this.panelWindow?.updateBounds(edge, maxWidthPx, displayId);
    this.panelAnimationWindow?.updateBounds(edge, maxWidthPx, displayId);
    this.unregisterAllAppBars();
    this.lastPanelState = { ...this.lastPanelState, edge, panelMode: 'hover', activePanelId: null };
    this.registerDockAppBar();
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

  async togglePanelPin(): Promise<void> {
    await this.panelManager?.togglePin();
  }

  async commitPanelResize(width: number): Promise<void> {
    await this.panelManager?.commitResize(width);
    if (this.lastPanelState.panelMode === 'pinned') {
      void this.syncPanelAppBar(this.lastPanelState);
    }
  }

  resizeDragPanel(width: number): void {
    this.panelManager?.resizeDrag(width);
  }

  async reloadAfterImport(nextConfig: AppConfig): Promise<void> {
    this.unregisterAllAppBars();
    this.dockWindow?.getBrowserWindow()?.destroy();
    this.panelWindow?.getBrowserWindow()?.destroy();
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
    this.unregisterAllAppBars();
  }

  // ---------- AppBar（全部通过隐藏锚点实现）----------

  /** 创建隐藏锚点并注册为 dock AppBar */
  private registerDockAppBar(): void {
    if (!this.appBarService.isAvailable()) return;
    const dockDip = getDockBounds(this.lastPanelState.edge, this.config.layout.displayId);

    // 为 DIP→物理转换找一个同屏窗口
    const refWin = this.dockWindow?.getBrowserWindow();
    if (!refWin) return;

    if (this.dockAnchor && !this.dockAnchor.isDestroyed()) {
      this.dockAnchor.destroy();
    }
    this.dockAnchor = createAppBarAnchor(dockDip);

    const physical = screen.dipToScreenRect(refWin, dockDip);
    const handle = this.dockAnchor.getNativeWindowHandle();
    this.appBarService.register(DOCK_APPBAR_ID, handle, this.lastPanelState.edge, {
      x: physical.x,
      y: physical.y,
      width: physical.width,
      height: physical.height
    });
    logger.info('Dock AppBar anchor registered', { dockDip });

    // 锚点创建时已在正确位置，但 ABM_SETPOS 可能微调过它。把可见 dock
    // 窗口也钉回屏边以确保视觉位置始终正确。
    const dockWin = this.dockWindow?.getBrowserWindow();
    if (dockWin && !dockWin.isDestroyed()) {
      dockWin.setBounds(dockDip);
    }
  }

  /** 同步 panel AppBar 锚点。pinned + 有活跃 panel → 注册；否则 → 注销 */
  private async syncPanelAppBar(state: PanelState): Promise<void> {
    if (!this.appBarService.isAvailable()) return;

    if (state.panelMode === 'pinned' && state.activePanelId) {
      const config = await this.configStore.read();
      const refWin = this.dockWindow?.getBrowserWindow();
      if (!refWin) return;

      const descriptor = config.panels.find((p) => p.id === state.activePanelId);
      const maxWidthPx = percentToPanelPx(
        config.layout.panelDefaultWidth,
        getTargetDisplay(config.layout.displayId).workArea.width
      );
      const panelWidthDip = getPreferredPanelWidth(
        descriptor?.preferredWidth,
        maxWidthPx
      );
      const dockDip = getDockBounds(state.edge, config.layout.displayId);
      const panelDip = getPanelBounds(state.edge, dockDip, panelWidthDip);

      // 创建/更新隐藏锚点
      if (this.panelAnchor && !this.panelAnchor.isDestroyed()) {
        if (this.panelAnchorWidthDip !== panelWidthDip) {
          this.panelAnchor.destroy();
          this.panelAnchor = null;
        }
      }
      if (!this.panelAnchor) {
        this.panelAnchor = createAppBarAnchor(panelDip);
        this.panelAnchorWidthDip = panelWidthDip;
      }

      const physical = screen.dipToScreenRect(refWin, panelDip);
      const handle = this.panelAnchor.getNativeWindowHandle();
      this.appBarService.register(PANEL_APPBAR_ID, handle, state.edge, {
        x: physical.x,
        y: physical.y,
        width: physical.width,
        height: physical.height
      });
      logger.info('Panel AppBar anchor registered', { panelDip, physical });

      // AppBar 注册完毕。Windows 异步处理 work area 变更后可能推送
      // always-on-top 窗口。不在当前 tick 断言——等 Windows 先完成重算，
      // 避免"窗口被 Windows 推离 → 被我们拉回"的闪烁。
      setTimeout(() => this.assertAllVisibleWindows(), 80);
      setTimeout(() => this.assertAllVisibleWindows(), 250);
      setTimeout(() => this.assertAllVisibleWindows(), 600);
    } else {
      this.unregisterPanelAppBar();
    }
  }

  /**
   * 把所有可见窗口钉回正确位置。
   * 当 work area 变化（WM_SETTINGCHANGE）后 Windows 可能把
   * always-on-top 窗口推入新 work area。此方法在 display-metrics-changed
   * 事件和 AppBar 注册后同步/延迟调用，确保窗口始终贴屏边。
   */
  private assertAllVisibleWindows(): void {
    const now = Date.now();
    if (now - this.lastAssertAllMs < 80) return;
    this.lastAssertAllMs = now;

    const edge = this.lastPanelState.edge ?? this.config.layout.edge;
    const displayId = this.config.layout.displayId;

    // 仅在 work area 实际变化时才校准位置（截图/全屏等触发的 display-metrics-changed 不影响 work area）
    const display = getTargetDisplay(displayId);
    const wa = display.workArea;
    if (this.cachedWorkArea) {
      const c = this.cachedWorkArea;
      if (c.x === wa.x && c.y === wa.y && c.width === wa.width && c.height === wa.height) {
        return;
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
