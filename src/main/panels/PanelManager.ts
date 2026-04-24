import { BrowserWindow, screen, WebContentsView } from 'electron';
import { BUILTIN_ADD_SITE_ID } from '../../shared/constants';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import { buildBuiltinPanelId, parseBuiltinPanelId } from '../../shared/builtinPanels';
import type { AppConfig, Edge, PanelDescriptor, PanelState, SiteInfo } from '../../shared/types';
import { logger } from '../utils/logger';
import type { ConfigStore } from '../store/ConfigStore';
import type { PanelAnimationWindow } from '../windows/PanelAnimationWindow';
import type { PanelMenuWindow } from '../windows/PanelMenuWindow';
import type { PanelWindow } from '../windows/PanelWindow';
import { getDockBounds } from '../utils/display';
import { getPreferredPanelWidth } from '../utils/panelBounds';
import { WebPanelHost } from './WebPanelHost';

export { clampPanelWidth } from './panelResize.ts';
import { clampPanelWidth as _clampPanelWidth } from './panelResize.ts';

const CHROME_HEIGHT = 76;
const OPEN_ANIMATION_MS = 170;
const CLOSE_ANIMATION_MS = 170;
const SNAPSHOT_PAINT_MS = 50;
const PANEL_WINDOW_SHOW_SETTLE_MS = 180;
const CLOSE_ANIMATION_DELAY_MS = 70;
const CLOSE_HANDOFF_PAINT_MS = 50;
const CONTENT_INSET = 8;
const PANEL_TOP_INSET = 8;
const PANEL_BORDER_WIDTH = 1;
const POINTER_TRACK_INTERVAL_MS = 80;
const POINTER_TRACK_MARGIN = 3;

const sleep = (ms: number): Promise<void> =>
  new Promise((resolve) => {
    setTimeout(resolve, ms);
  });

type PanelLifecycleState = 'closed' | 'opening' | 'open' | 'closing';

export class PanelManager {
  private readonly webPanelHost: WebPanelHost;
  private readonly panelWindow: PanelWindow;
  private readonly animationWindow: PanelAnimationWindow;
  private readonly panelWindowRef: BrowserWindow;
  private readonly animationWindowRef: BrowserWindow;
  private currentPanelId: string | null = null;
  private state: PanelLifecycleState = 'closed';
  private closeTimer: NodeJS.Timeout | null = null;
  private pointerTracker: NodeJS.Timeout | null = null;
  private pointerOutsideSince: number | null = null;
  private lifecycleToken = 0;
  private switchToken = 0;
  private sticky = false;
  private panelMode: 'hover' | 'pinned' = 'hover';
  private edge: Edge = 'right';
  private hoverCloseDelayMs = 300;
  private pendingDestroyId: string | null = null;
  private readonly snapshots = new Map<string, string>();

  constructor(
    private readonly configStore: ConfigStore,
    panelWindow: PanelWindow,
    animationWindow: PanelAnimationWindow,
    private readonly menuWindow: PanelMenuWindow,
    private readonly emitPanelState: (state: PanelState) => void
  ) {
    this.panelWindow = panelWindow;
    this.animationWindow = animationWindow;
    const browserWindow = panelWindow.getBrowserWindow();
    const animationBrowserWindow = animationWindow.getBrowserWindow();
    if (!browserWindow) {
      throw new Error('Panel window must exist before PanelManager initialization.');
    }
    if (!animationBrowserWindow) {
      throw new Error('Panel animation window must exist before PanelManager initialization.');
    }

    this.panelWindowRef = browserWindow;
    this.animationWindowRef = animationBrowserWindow;
    this.panelWindowRef.setOpacity(0);
    this.panelWindowRef.setIgnoreMouseEvents(true, { forward: true });
    this.webPanelHost = new WebPanelHost({
      readConfig: () => this.configStore.read(),
      updateConfig: (patch) => this.configStore.update(patch),
      emitNavigation: (payload) =>
        this.emitNavigation(payload.panelId, payload.url, payload.canGoBack)
    });
  }

  async hoverPanel(panelId: string): Promise<void> {
    this.sticky = false;
    await this.showPanel(panelId);
  }

  async showPanel(panelId: string, sticky = false): Promise<void> {
    const config = await this.configStore.read();
    await this.webPanelHost.refreshConfig();
    const descriptor = this.getDescriptor(config, panelId);
    if (!descriptor) {
      return;
    }

    this.cancelCloseTimer();
    this.sticky = sticky;
    this.applyHoverConfig(config);
    this.startPointerTracking();

    if (this.currentPanelId && this.currentPanelId !== panelId && this.state !== 'closed') {
      if (this.state === 'closing') {
        this.state = 'open';
        this.raisePanelWindows();
        this.panelWindowRef.setOpacity(1);
        this.panelWindowRef.setIgnoreMouseEvents(false);
        this.resetAnimationWindow();
      }

      this.applyPanelBounds(descriptor, config);
      await this.switchPanel(descriptor, config.layout.edge);
      this.emitState(config.layout.edge, this.panelMode);
      return;
    }

    if (this.currentPanelId === panelId && this.state === 'open') {
      this.emitState(config.layout.edge, this.panelMode);
      return;
    }

    this.state = 'opening';
    const token = ++this.lifecycleToken;
    this.currentPanelId = panelId;
    this.pendingDestroyId = null;
    this.applyPanelBounds(descriptor, config);
    this.raisePanelWindows();
    this.panelWindowRef.setIgnoreMouseEvents(false);

    this.sendAnimationOpen(descriptor, config.layout.edge, this.snapshots.get(panelId) ?? null);

    await sleep(OPEN_ANIMATION_MS);
    if (token !== this.lifecycleToken || this.state !== 'opening' || this.currentPanelId !== panelId) {
      return;
    }

    this.sendAnimateIn(descriptor, config.layout.edge, this.snapshots.get(panelId) ?? null);
    this.panelWindowRef.setOpacity(0);
    this.attachDescriptorView(descriptor, config.layout.edge);
    await sleep(PANEL_WINDOW_SHOW_SETTLE_MS);
    if (token !== this.lifecycleToken || this.state !== 'opening' || this.currentPanelId !== panelId) {
      return;
    }

    this.panelWindowRef.setOpacity(1);
    this.raisePanelWindows();
    this.resetAnimationWindow();
    this.cancelCloseTimer();
    this.state = 'open';
    this.emitState(config.layout.edge, this.panelMode);
  }

  scheduleHide(destroy = false): void {
    this.cancelCloseTimer();
    void this.configStore.read().then((config) => {
      void this.webPanelHost.refreshConfig();
      this.applyHoverConfig(config);
      if (this.sticky || this.panelMode === 'pinned') {
        return;
      }

      this.pendingDestroyId = destroy ? this.currentPanelId : null;
      this.pointerOutsideSince = Date.now();
      this.closeTimer = setTimeout(() => {
        void this.hidePanel(destroy);
      }, config.behavior.hoverCloseDelayMs);
    });
  }

  async hidePanel(destroy = false): Promise<void> {
    if (this.state === 'closed' || this.state === 'closing') {
      return;
    }

    const config = await this.configStore.read();
    await this.webPanelHost.refreshConfig();
    const closingPanelId = this.currentPanelId;
    this.cancelCloseTimer();
    this.closeMenu();
    this.state = 'closing';
    const token = ++this.lifecycleToken;
    this.pendingDestroyId = destroy ? this.currentPanelId : this.pendingDestroyId;
    this.emitState(config.layout.edge, this.panelMode, false);

    const snapshotPanelId = this.currentPanelId;
    const currentView = this.webPanelHost.getView(this.currentPanelId);
    const snapshotDataUrl = await this.captureViewSnapshot(currentView);
    if (snapshotPanelId) {
      if (snapshotDataUrl) {
        this.snapshots.set(snapshotPanelId, snapshotDataUrl);
      }

      await sleep(SNAPSHOT_PAINT_MS);
    }

    if (token !== this.lifecycleToken || this.state !== 'closing' || this.currentPanelId !== closingPanelId) {
      return;
    }

    const descriptor = snapshotPanelId ? this.getDescriptor(config, snapshotPanelId) : null;
    if (descriptor) {
      this.sendAnimationClose(
        descriptor,
        config.layout.edge,
        snapshotDataUrl ?? this.snapshots.get(descriptor.id) ?? null,
        CLOSE_ANIMATION_DELAY_MS
      );
    }

    await sleep(CLOSE_HANDOFF_PAINT_MS);
    if (token !== this.lifecycleToken || this.state !== 'closing' || this.currentPanelId !== closingPanelId) {
      return;
    }

    this.panelWindowRef.setOpacity(0);
    this.webPanelHost.applyMuteState(currentView ? snapshotPanelId : null, !config.behavior.keepAudioOnHide);

    if (currentView) {
      currentView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }

    await sleep(CLOSE_ANIMATION_MS);
    if (token !== this.lifecycleToken || this.state !== 'closing' || this.currentPanelId !== closingPanelId) {
      return;
    }

    this.panelWindowRef.setIgnoreMouseEvents(true, { forward: true });
    this.hideAnimationWindow();
    this.stopPointerTracking();

    if (this.pendingDestroyId) {
      this.webPanelHost.destroyView(this.pendingDestroyId);
      this.snapshots.delete(this.pendingDestroyId);
      this.pendingDestroyId = null;
    }

    this.state = 'closed';
    this.currentPanelId = null;
    this.sticky = false;
    this.emitState(config.layout.edge, this.panelMode);
  }

  markSticky(): void {
    this.sticky = true;
  }

  cancelScheduledHide(): void {
    this.cancelCloseTimer();
    this.pointerOutsideSince = null;
  }

  clearStickyAndHide(): void {
    this.sticky = false;
    void this.hidePanel(false);
  }

  getCurrentPanelId(): string | null {
    return this.currentPanelId;
  }

  async getMenuState(panelId: string): Promise<import('../../shared/types').PanelMenuState | null> {
    return this.webPanelHost.getMenuState(panelId);
  }

  async runMenuAction(
    panelId: string,
    action:
      | 'reload'
      | 'copy-link'
      | 'toggle-mobile-view'
      | 'toggle-notifications-snooze'
      | 'open-edit-site'
      | 'clear-site-data'
      | 'open-site-info'
  ): Promise<import('../../shared/types').PanelMenuState | null> {
    switch (action) {
      case 'reload':
        return this.webPanelHost.reload(panelId);
      case 'copy-link':
        return this.webPanelHost.copyLink(panelId);
      case 'toggle-mobile-view':
        return this.webPanelHost.toggleMobileView(panelId);
      case 'toggle-notifications-snooze':
        return this.webPanelHost.toggleNotificationsSnooze(panelId);
      case 'open-edit-site':
        await this.showPanel(buildBuiltinPanelId('edit-site', panelId), true);
        return this.webPanelHost.getMenuState(panelId);
      case 'clear-site-data':
        return this.webPanelHost.clearSiteData(panelId);
      case 'open-site-info':
        await this.showPanel(buildBuiltinPanelId('site-info', panelId), true);
        return this.webPanelHost.getMenuState(panelId);
      default:
        return null;
    }
  }

  async getSiteInfo(panelId: string): Promise<SiteInfo | null> {
    return this.webPanelHost.getSiteInfo(panelId);
  }

  async openExternal(panelId: string, url?: string): Promise<void> {
    await this.webPanelHost.openExternal(panelId, url);
  }

  async goBack(panelId: string): Promise<void> {
    await this.webPanelHost.goBack(panelId);
  }

  async openMenu(anchor: import('../../shared/types').PanelMenuAnchor): Promise<void> {
    const state = await this.webPanelHost.getMenuState(anchor.panelId);
    if (!state) {
      return;
    }

    const panelBounds = this.panelWindowRef.getContentBounds();
    this.cancelCloseTimer();
    this.pointerOutsideSince = null;

    this.menuWindow.open({
      ...anchor,
      x: panelBounds.x + anchor.x,
      y: panelBounds.y + anchor.y,
      state
    });
  }

  closeMenu(): void {
    this.menuWindow.hide();
  }

  closeMenuAndResumeHover(): void {
    this.closeMenu();
    this.sticky = false;
    this.pointerOutsideSince = null;
  }

  destroyPanelView(panelId: string): void {
    this.webPanelHost.destroyView(panelId);
    this.snapshots.delete(panelId);
  }

  async togglePin(): Promise<void> {
    if (this.panelMode === 'hover') {
      this.panelMode = 'pinned';
      this.cancelCloseTimer();
      this.emitState(this.edge, this.panelMode);
      return;
    }
    this.panelMode = 'hover';
    this.emitState(this.edge, this.panelMode);
    if (this.state === 'open') {
      await this.hidePanel(false);
    }
  }

  /**
   * 拖拽中途的宽度同步（rAF 节流来自渲染进程）。
   *
   * 本方法明确偏离 PRD §5.14 铁律 3（"固定模式拖拽期间不改原生窗口几何"）。
   * 理由：M5 架构下 PanelWindow 宽度 = chrome 宽度，CSS-only 伸缩物理不可达。
   * 铁律 3 的底层原因（Win32 AppBar 系统工作区重计算导致其他窗口避让）在 v1.0
   * 不接入 AppBar 时不成立（PRD §5.7.1 明文禁用 AppBar）。剩余的 Electron
   * setBounds 高频合成闪烁已由渲染进程 rAF 节流到 ≤60fps 控制。
   * 合规检查：`view.setBounds` 仍遵守铁律 2，仅在 mouseup (commitResize) 调用 1 次。
   * 详见 docs/superpowers/specs/2026-04-24-m6-design.md §3.2。
   */
  resizeDrag(newWidth: number): void {
    if (this.panelMode !== 'pinned' || this.state !== 'open') {
      return;
    }
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const width = _clampPanelWidth(newWidth, display.workArea.width);
    logger.info('[m6] resizeDrag', { newWidth });
    this.panelWindow.updateBounds(this.edge, width);
    this.animationWindow.updateBounds(this.edge, width);
    // 不动 view；chrome 在 view 前方覆盖"拉出"区域
  }

  commitResize(newWidth: number): void {
    // mouseup 终点：一次性对齐 view + 持久化 panelDefaultWidth
    const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
    const width = _clampPanelWidth(newWidth, display.workArea.width);
    logger.info('[m6] commitResize', { newWidth });

    this.panelWindow.updateBounds(this.edge, width);
    this.animationWindow.updateBounds(this.edge, width);

    const view = this.currentPanelId
      ? this.webPanelHost.getView(this.currentPanelId)
      : null;
    if (view) {
      const [w, h] = this.panelWindowRef.getContentSize();
      view.setBounds({ x: 0, y: CHROME_HEIGHT, width: w, height: h - CHROME_HEIGHT });
    }

    void this.configStore.update({ layout: { panelDefaultWidth: width } });
  }

  private async switchPanel(descriptor: PanelDescriptor, edge: Edge): Promise<void> {
    const token = ++this.switchToken;
    this.pendingDestroyId = null;
    if (this.panelMode === 'hover') {
      this.sticky = false;
    }
    this.closeMenu();

    this.panelWindowRef.webContents.send(IPC_CHANNELS.chromeFadeOut);
    await sleep(60);
    if (token !== this.switchToken) {
      return;
    }

    const oldView = this.webPanelHost.getView(this.currentPanelId);
    if (oldView) {
      oldView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }

    this.attachDescriptorView(descriptor, edge);
    this.webPanelHost.applyMuteState(descriptor.id, false);

    this.panelWindowRef.webContents.send(IPC_CHANNELS.chromeFadeIn, {
      descriptor,
      edge,
      url: this.getDescriptorUrl(descriptor)
    });

    this.currentPanelId = descriptor.id;
    this.state = 'open';
  }

  private applyHoverConfig(config: AppConfig): void {
    this.edge = config.layout.edge;
    this.hoverCloseDelayMs = config.behavior.hoverCloseDelayMs;
  }

  private applyPanelBounds(descriptor: PanelDescriptor, config: AppConfig): void {
    const panelWidth = getPreferredPanelWidth(
      descriptor.preferredWidth,
      config.layout.panelDefaultWidth
    );

    this.panelWindow.updateBounds(config.layout.edge, panelWidth);
    this.animationWindow.updateBounds(config.layout.edge, panelWidth);
  }

  private startPointerTracking(): void {
    if (this.pointerTracker) {
      return;
    }

    this.pointerOutsideSince = null;
    this.pointerTracker = setInterval(() => {
      this.checkPointerLocation();
    }, POINTER_TRACK_INTERVAL_MS);
  }

  private stopPointerTracking(): void {
    if (this.pointerTracker) {
      clearInterval(this.pointerTracker);
      this.pointerTracker = null;
    }

    this.pointerOutsideSince = null;
  }

  private checkPointerLocation(): void {
    if (this.state === 'closed' || this.state === 'closing') {
      this.pointerOutsideSince = null;
      return;
    }

    if (this.sticky || this.panelMode === 'pinned') {
      this.pointerOutsideSince = null;
      return;
    }

    if (this.isCursorInsideInteractiveArea()) {
      this.pointerOutsideSince = null;
      this.cancelCloseTimer();
      return;
    }

    const now = Date.now();
    this.pointerOutsideSince ??= now;

    if (now - this.pointerOutsideSince >= this.hoverCloseDelayMs) {
      this.pointerOutsideSince = null;
      void this.hidePanel(false);
    }
  }

  private isCursorInsideInteractiveArea(): boolean {
    const cursor = screen.getCursorScreenPoint();
    const panelBounds = this.panelWindowRef.getBounds();
    const dockBounds = getDockBounds(this.edge);
    const menuBrowserWindow = this.menuWindow.getBrowserWindow();
    const menuBounds =
      menuBrowserWindow && menuBrowserWindow.isVisible() ? menuBrowserWindow.getBounds() : null;

    return (
      this.isPointInsideBounds(cursor, panelBounds) ||
      this.isPointInsideBounds(cursor, dockBounds) ||
      (menuBounds ? this.isPointInsideBounds(cursor, menuBounds) : false)
    );
  }

  private isPointInsideBounds(
    point: Electron.Point,
    bounds: Electron.Rectangle | { x: number; y: number; width: number; height: number }
  ): boolean {
    return (
      point.x >= bounds.x - POINTER_TRACK_MARGIN &&
      point.x <= bounds.x + bounds.width + POINTER_TRACK_MARGIN &&
      point.y >= bounds.y - POINTER_TRACK_MARGIN &&
      point.y <= bounds.y + bounds.height + POINTER_TRACK_MARGIN
    );
  }

  private attachDescriptorView(descriptor: PanelDescriptor, edge: Edge): void {
    if (descriptor.type !== 'web') {
      return;
    }

    const view = this.webPanelHost.getOrCreateView(descriptor);
    this.attachView(view);
    this.updateViewBounds(view, edge);
    this.bindViewEvents(descriptor, view);
    this.webPanelHost.applyMuteState(descriptor.id, false);
  }

  private attachView(view: WebContentsView): void {
    const contentView = this.panelWindowRef.contentView;
    if (!contentView.children.includes(view)) {
      contentView.addChildView(view);
    }
  }

  private updateViewBounds(view: WebContentsView, edge: Edge): void {
    const [width, height] = this.panelWindowRef.getContentSize();
    const sideInsetLeft = edge === 'right' ? CONTENT_INSET : 0;
    const sideInsetRight = edge === 'left' ? CONTENT_INSET : 0;
    const dockSideBorderWidth = 0;
    const outerSideBorderWidth = PANEL_BORDER_WIDTH;
    const leftBorderWidth = edge === 'right' ? outerSideBorderWidth : dockSideBorderWidth;
    const rightBorderWidth = edge === 'left' ? outerSideBorderWidth : dockSideBorderWidth;
    const innerWidth = width - sideInsetLeft - sideInsetRight;

    view.setBounds({
      x: sideInsetLeft + leftBorderWidth,
      y: PANEL_TOP_INSET + CHROME_HEIGHT,
      width: Math.max(0, innerWidth - leftBorderWidth - rightBorderWidth),
      height: Math.max(0, height - PANEL_TOP_INSET - CHROME_HEIGHT - CONTENT_INSET - PANEL_BORDER_WIDTH)
    });
  }

  private bindViewEvents(descriptor: PanelDescriptor, view: WebContentsView): void {
    if ((view.webContents as WebContentsWithMeta).__sidebarBound) {
      return;
    }

    (view.webContents as WebContentsWithMeta).__sidebarBound = true;

    view.webContents.on('before-input-event', (_event, input) => {
      this.cancelCloseTimer();
      this.pointerOutsideSince = null;
    });
  }

  private sendAnimateIn(descriptor: PanelDescriptor, edge: Edge, snapshotDataUrl: string | null): void {
    this.panelWindowRef.webContents.send(IPC_CHANNELS.panelAnimateIn, {
      panelId: descriptor.id,
      descriptor,
      edge,
      url: this.getDescriptorUrl(descriptor),
      snapshotDataUrl
    });
  }

  private sendAnimationOpen(descriptor: PanelDescriptor, edge: Edge, snapshotDataUrl: string | null): void {
    this.animationWindowRef.setAlwaysOnTop(true, 'screen-saver');
    this.animationWindowRef.moveTop();
    this.animationWindowRef.webContents.send(IPC_CHANNELS.panelAnimationOpen, {
      panelId: descriptor.id,
      descriptor,
      edge,
      url: this.getDescriptorUrl(descriptor),
      snapshotDataUrl
    });
  }

  private sendAnimationClose(
    descriptor: PanelDescriptor,
    edge: Edge,
    snapshotDataUrl: string | null,
    animationDelayMs = 0
  ): void {
    this.animationWindowRef.webContents.send(IPC_CHANNELS.panelAnimationClose, {
      panelId: descriptor.id,
      descriptor,
      edge,
      url: this.getDescriptorUrl(descriptor),
      snapshotDataUrl,
      animationDelayMs
    });
  }

  private resetAnimationWindow(): void {
    this.animationWindowRef.webContents.send(IPC_CHANNELS.panelAnimationReset);
  }

  private hideAnimationWindow(): void {
    this.animationWindow.hide();
  }

  private raisePanelWindows(): void {
    this.animationWindowRef.setAlwaysOnTop(true, 'screen-saver');
    this.panelWindowRef.setAlwaysOnTop(true, 'screen-saver');
    this.animationWindowRef.moveTop();
    this.panelWindowRef.moveTop();
  }

  private async captureViewSnapshot(view: WebContentsView | null): Promise<string | null> {
    if (!view || view.webContents.isDestroyed()) {
      return null;
    }

    try {
      const image = await view.webContents.capturePage();
      return image.isEmpty() ? null : image.toDataURL();
    } catch (error) {
      logger.warn('Failed to capture panel snapshot', error);
      return null;
    }
  }

  private emitState(
    edge: Edge,
    panelMode: 'hover' | 'pinned',
    panelVisible = this.state === 'open'
  ): void {
    this.emitPanelState({
      activePanelId: this.currentPanelId,
      panelVisible,
      panelMode,
      edge
    });
  }

  private emitNavigation(panelId: string, url: string, canGoBack?: boolean): void {
    this.panelWindowRef.webContents.send(IPC_CHANNELS.panelNavigationState, {
      panelId,
      url,
      canGoBack: canGoBack ?? this.webPanelHost.getView(panelId)?.webContents.canGoBack() ?? false
    });
  }

  private getDescriptor(config: AppConfig, panelId: string): PanelDescriptor | null {
    const builtinRoute = parseBuiltinPanelId(panelId);
    if (builtinRoute?.widgetId === 'add-site') {
      return {
        id: BUILTIN_ADD_SITE_ID,
        type: 'builtin',
        title: '添加网页',
        iconSource: {
          kind: 'letter',
          fallbackLetter: '+',
          fallbackColor: '#375a7f'
        },
        order: -1,
        preferredWidth: config.layout.panelDefaultWidth,
        builtin: {
          widgetId: 'add-site'
        }
      };
    }

    if (builtinRoute?.widgetId === 'edit-site') {
      return {
        id: panelId,
        type: 'builtin',
        title: '编辑此站点',
        iconSource: {
          kind: 'letter',
          fallbackLetter: 'E',
          fallbackColor: '#5f4b8b'
        },
        order: -1,
        preferredWidth: config.layout.panelDefaultWidth,
        builtin: {
          widgetId: 'edit-site',
          targetPanelId: builtinRoute.targetPanelId
        }
      };
    }

    if (builtinRoute?.widgetId === 'site-info') {
      return {
        id: panelId,
        type: 'builtin',
        title: '站点信息',
        iconSource: {
          kind: 'letter',
          fallbackLetter: 'I',
          fallbackColor: '#3f6f62'
        },
        order: -1,
        preferredWidth: config.layout.panelDefaultWidth,
        builtin: {
          widgetId: 'site-info',
          targetPanelId: builtinRoute.targetPanelId
        }
      };
    }

    return config.panels.find((panel) => panel.id === panelId) ?? null;
  }

  private getDescriptorUrl(descriptor: PanelDescriptor): string {
    return descriptor.web?.url ?? '';
  }

  private cancelCloseTimer(): void {
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
  }
}

interface WebContentsWithMeta {
  __sidebarBound?: boolean;
}
