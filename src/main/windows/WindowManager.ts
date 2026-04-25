import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { AppConfig, PanelsUpdatedPayload } from '../../shared/types';
import type { ConfigStore } from '../store/ConfigStore';
import { PanelManager } from '../panels/PanelManager';
import { PanelAnimationWindow } from './PanelAnimationWindow';
import { DockWindow } from './DockWindow';
import { PanelMenuWindow } from './PanelMenuWindow';
import { PanelWindow } from './PanelWindow';

export class WindowManager {
  private dockWindow: DockWindow | null = null;
  private panelWindow: PanelWindow | null = null;
  private panelAnimationWindow: PanelAnimationWindow | null = null;
  private panelMenuWindow: PanelMenuWindow | null = null;
  private panelManager: PanelManager | null = null;
  // 进入全屏前 Dock 是否可见。用于退出全屏时正确恢复，避免覆盖用户主动 hide 的意图。
  private dockVisibleBeforeFullscreen: boolean | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly configStore: ConfigStore,
    private readonly emitPanelState: (state: {
      activePanelId: string | null;
      panelVisible: boolean;
      pinned: boolean;
      edge: 'left' | 'right';
    }) => void
  ) {}

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
      this.emitPanelState
    );
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
  }

  showDockFromTray(): void {
    this.dockWindow?.show();
  }

  /**
   * 第二实例触发时调用：确保 Dock 可见并置顶。
   * - 用户从托盘隐藏过 Dock：show 恢复
   * - 全屏窗口曾压过 Dock：moveTop 提到最前
   * - 不抢 focus（避免打断当前前台应用）
   */
  activateExistingInstance(): void {
    this.dockWindow?.show();
    this.dockWindow?.getBrowserWindow()?.moveTop();
  }

  /**
   * PRD §5.9.4 全屏检测：检测到前台全屏时调用，hide Dock + Panel。
   * 记录进入全屏前的可见状态，避免覆盖用户主动 hide。
   */
  hideForFullscreen(): void {
    this.dockVisibleBeforeFullscreen = this.isDockVisible();
    this.dockWindow?.hide();
    this.panelWindow?.hide();
    this.panelMenuWindow?.hide();
  }

  /**
   * PRD §5.9.4：退出全屏后仅在用户进入全屏前 Dock 可见的情况下恢复显示。
   * 面板不自动恢复（PRD 要求等用户下次悬停）。
   */
  restoreFromFullscreen(): void {
    if (this.dockVisibleBeforeFullscreen) {
      this.dockWindow?.show();
    }
    this.dockVisibleBeforeFullscreen = null;
  }

  /**
   * PRD §5.8 左右贴边切换：
   * - 强制收起当前 panel（无动画）
   * - 重定位 dock / panel / animation 窗口到新边
   * - 持久化已由 configStore 完成（caller 负责），此处仅同步 native bounds
   */
  applyEdgeChange(config: AppConfig): void {
    const edge = config.layout.edge;
    const displayId = config.layout.displayId;
    this.panelManager?.forceCloseAndResetMode(edge, displayId);
    this.dockWindow?.updateBounds(edge, displayId);
    this.panelWindow?.updateBounds(edge, config.layout.panelDefaultWidth, displayId);
    this.panelAnimationWindow?.updateBounds(edge, config.layout.panelDefaultWidth, displayId);
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
  }

  resizeDragPanel(width: number): void {
    this.panelManager?.resizeDrag(width);
  }
}
