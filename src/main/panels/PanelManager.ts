import { BrowserView, BrowserWindow, screen } from 'electron';
import { BUILTIN_SETTINGS_ID } from '../../shared/constants';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import {
  buildBuiltinPanelId,
  parseBuiltinPanelId
} from '../../shared/builtinPanels';
import type {
  AppConfig,
  AppearanceConfig,
  Edge,
  PanelDescriptor,
  PanelState,
  SiteInfo
} from '../../shared/types';
import { logger } from '../utils/logger';
import type { ConfigStore } from '../store/ConfigStore';
import type { PanelAnimationWindow } from '../windows/PanelAnimationWindow';
import type { PanelMenuWindow } from '../windows/PanelMenuWindow';
import type { PanelWindow } from '../windows/PanelWindow';
import { getDockBounds, getTargetDisplay } from '../utils/display';
import { getPreferredPanelWidth } from '../utils/panelBounds';
import { WebPanelHost } from './WebPanelHost';
import { createBuiltinPanelDescriptor } from './builtinPanelDescriptor';

export { clampPanelWidth } from './panelResize.ts';
import {
  clampPanelWidth as _clampPanelWidth,
  getPanelWidthRange
} from './panelResize.ts';

const CHROME_HEIGHT = 76;
const OPEN_ANIMATION_MS = 340;
const CLOSE_ANIMATION_MS = 280;
const SNAPSHOT_PAINT_MS = 50;
const OPEN_HANDOFF_PAINT_MS = 64;
const CLOSE_ANIMATION_DELAY_MS = 70;
const CLOSE_HANDOFF_PAINT_MS = 50;
const CONTENT_INSET = 8;
const PANEL_TOP_INSET = 8;
const PANEL_BORDER_WIDTH = 1;
const POINTER_TRACK_INTERVAL_MS = 80;
const POINTER_TRACK_MARGIN = 3;
const RESIZE_RELEASE_MOVE_THRESHOLD = 12;

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
  /** Latest requested panel; it may differ from what is currently on screen during a switch. */
  private currentPanelId: string | null = null;
  /** Panel whose chrome/content has been synchronously committed to the panel window. */
  private presentedPanelId: string | null = null;
  private state: PanelLifecycleState = 'closed';
  private closeTimer: NodeJS.Timeout | null = null;
  private pointerTracker: NodeJS.Timeout | null = null;
  private pointerOutsideSince: number | null = null;
  private lifecycleToken = 0;
  private switchToken = 0;
  private showPanelToken = 0;
  private sticky = false;
  // dock 底部 ⋮ 弹出原生 Menu.popup 期间冻结隐藏逻辑。原生菜单没有 BrowserWindow，
  // isCursorInsideInteractiveArea 的几何检测会把它判为"光标已离开 dock"。
  // 用过期时间戳代替 boolean lock：menu-will-close 万一没触发也会自动恢复，
  // 不会有"锁永远卡住"的副作用。
  private hideMutedUntilMs = 0;
  private panelMode: 'hover' | 'pinned' = 'hover';
  private edge: Edge = 'right';
  private displayId: number | undefined = undefined;
  /** 缓存 builtin 面板（设置等）最后一次拖拽宽度，下次打开时复用 */
  private builtinPreferredWidths = new Map<string, number>();
  private hoverCloseDelayMs = 300;
  private pendingDestroyId: string | null = null;
  private resizeReleaseGuardPoint: Electron.Point | null = null;
  private nativeResizeActive = false;
  private readonly snapshots = new Map<string, string>();
  private readonly createdAt = Date.now();

  private readonly dockWindowRef: BrowserWindow;

  constructor(
    private readonly configStore: ConfigStore,
    panelWindow: PanelWindow,
    animationWindow: PanelAnimationWindow,
    private readonly menuWindow: PanelMenuWindow,
    private readonly emitPanelState: (state: PanelState) => void,
    dockBrowserWindow: BrowserWindow
  ) {
    this.panelWindow = panelWindow;
    this.animationWindow = animationWindow;
    this.dockWindowRef = dockBrowserWindow;
    const browserWindow = panelWindow.getBrowserWindow();
    const animationBrowserWindow = animationWindow.getBrowserWindow();
    if (!browserWindow) {
      throw new Error(
        'Panel window must exist before PanelManager initialization.'
      );
    }
    if (!animationBrowserWindow) {
      throw new Error(
        'Panel animation window must exist before PanelManager initialization.'
      );
    }

    this.panelWindowRef = browserWindow;
    this.animationWindowRef = animationBrowserWindow;
    this.panelWindowRef.setIgnoreMouseEvents(true, { forward: true });
    this.webPanelHost = new WebPanelHost({
      readConfig: () => this.configStore.read(),
      updateConfig: (patch) => this.configStore.update(patch),
      emitNavigation: (payload) =>
        this.emitNavigation(payload.panelId, payload.url, payload.canGoBack),
      emitLoading: (payload) =>
        this.emitLoading(payload.panelId, payload.isLoading)
    });

    this.panelWindowRef.on('will-resize', (event, _newBounds, details) => {
      const allowedEdge = this.edge === 'right' ? 'left' : 'right';
      if (this.state !== 'open' || details.edge !== allowedEdge) {
        event.preventDefault();
        return;
      }
      this.beginNativeResize();
    });
    this.panelWindowRef.on('resized', () => this.finishNativeResize());
  }

  async hoverPanel(panelId: string): Promise<void> {
    this.sticky = false;
    await this.showPanel(panelId);
  }

  async showPanel(panelId: string, sticky = false): Promise<void> {
    const showToken = ++this.showPanelToken;
    const config = await this.configStore.read();
    await this.webPanelHost.refreshConfig();
    if (showToken !== this.showPanelToken) {
      return;
    }
    const descriptor = this.getDescriptor(config, panelId);
    if (!descriptor) {
      return;
    }

    this.cancelCloseTimer();
    this.sticky = sticky;
    if (sticky) {
      this.panelMode = 'pinned';
    }
    this.applyHoverConfig(config);
    this.startPointerTracking();

    if (
      this.currentPanelId &&
      this.currentPanelId !== panelId &&
      this.state === 'open'
    ) {
      ++this.lifecycleToken;
      this.currentPanelId = panelId;
      this.applyPanelBounds(descriptor, config);
      await this.switchPanel(descriptor, config.layout.edge, config.appearance);
      this.emitState(config.layout.edge, this.panelMode);
      return;
    }

    if (this.currentPanelId === panelId && this.state === 'open') {
      this.emitState(config.layout.edge, this.panelMode);
      return;
    }

    if (this.state === 'opening' || this.state === 'closing') {
      ++this.lifecycleToken;
      ++this.switchToken;
      this.panelWindow.hide();
      this.resetAnimationWindow();
    }

    this.state = 'opening';
    const token = ++this.lifecycleToken;
    this.currentPanelId = panelId;
    this.pendingDestroyId = null;
    this.applyPanelBounds(descriptor, config);
    this.panelWindow.hide();
    this.panelWindowRef.setIgnoreMouseEvents(false);

    this.sendAnimateIn(
      descriptor,
      config.layout.edge,
      this.snapshots.get(panelId) ?? null,
      config.appearance
    );
    this.presentDescriptorView(descriptor, config.layout.edge);
    this.sendAnimationOpen(
      descriptor,
      config.layout.edge,
      this.snapshots.get(panelId) ?? null,
      config.appearance
    );

    await sleep(OPEN_ANIMATION_MS);
    if (
      token !== this.lifecycleToken ||
      this.state !== 'opening' ||
      this.currentPanelId !== panelId
    ) {
      return;
    }

    // Keep the completed animation above the real HWND while DWM composites its
    // first visible frames. Revealing both in the same tick exposes stale pixels.
    this.panelWindow.show();
    this.coverPanelWithAnimation();
    await sleep(OPEN_HANDOFF_PAINT_MS);
    if (
      token !== this.lifecycleToken ||
      this.state !== 'opening' ||
      this.currentPanelId !== panelId
    ) {
      return;
    }

    this.resetAnimationWindow();
    this.revealPanelWindow();
    this.cancelCloseTimer();
    this.state = 'open';
    this.emitState(config.layout.edge, this.panelMode);

    // settings 等模态 builtin 面板需要点击外部自动收起。让 panel window 取焦点，
    // 这样用户点桌面/其它应用时会触发 blur 事件，被 handlePanelBlur 捕获。
    if (panelId === BUILTIN_SETTINGS_ID) {
      this.panelWindowRef.focus();
    }
  }

  /**
   * panel window 失焦回调（由 WindowManager 的 'blur' 监听器调用）。
   * 仅对 settings 面板生效——其它面板（hover web、add-site 等）按 PRD 走自己的关闭路径。
   * 用 setTimeout 延后判断焦点目标：用户点 dock 图标会让 dockWindow 取焦点并触发
   * switchPanel，此时不应误关。判断条件：
   *   - 50ms 后没有任何"我们的"窗口取得焦点（focus 转到桌面 / 别的应用）
   *   - 且当前面板仍是 settings（switch 没把它换掉）
   */
  handlePanelBlur(): void {
    if (this.currentPanelId !== BUILTIN_SETTINGS_ID) {
      return;
    }
    setTimeout(() => {
      if (this.nativeResizeActive) {
        return;
      }
      if (BrowserWindow.getFocusedWindow()) {
        return;
      }
      if (this.panelMode === 'pinned') {
        return;
      }
      if (
        this.currentPanelId === BUILTIN_SETTINGS_ID &&
        this.state === 'open'
      ) {
        void this.hidePanel(true);
      }
    }, 50);
  }

  /**
   * dock 底部 ⋮ / 其它需要短暂冻结 hide 的入口调用。durationMs 默认 5s 兜底，
   * 真正取消由 clearHideMute 在事件结束时显式调用。即便 caller 漏调，5s 后
   * 自动恢复，避免锁永久卡住。
   */
  muteHide(durationMs = 5000): void {
    this.hideMutedUntilMs = Date.now() + durationMs;
    this.cancelCloseTimer();
    this.pointerOutsideSince = null;
  }

  clearHideMute(): void {
    this.hideMutedUntilMs = 0;
  }

  private isHideMuted(): boolean {
    return Date.now() < this.hideMutedUntilMs;
  }

  scheduleHide(destroy = false): void {
    this.cancelCloseTimer();
    void this.configStore.read().then((config) => {
      void this.webPanelHost.refreshConfig();
      this.applyHoverConfig(config);
      if (this.isAutoHideBlocked()) return;

      this.pendingDestroyId = destroy ? this.presentedPanelId : null;
      this.pointerOutsideSince = Date.now();
      this.closeTimer = setTimeout(() => {
        this.closeTimer = null;
        if (this.isAutoHideBlocked()) return;
        void this.hidePanel(destroy);
      }, config.behavior.hoverCloseDelayMs);
    });
  }

  async hidePanel(destroy = false): Promise<void> {
    if (this.state === 'closed' || this.state === 'closing') {
      return;
    }

    this.cancelActiveResize();
    this.cancelCloseTimer();
    this.closeMenu();
    ++this.showPanelToken;
    ++this.switchToken;
    const closingPanelId = this.presentedPanelId;
    this.currentPanelId = closingPanelId;
    this.state = 'closing';
    const token = ++this.lifecycleToken;
    this.pendingDestroyId = destroy
      ? this.presentedPanelId
      : this.pendingDestroyId;
    this.emitState(this.edge, this.panelMode, false);

    const config = await this.configStore.read();
    await this.webPanelHost.refreshConfig();
    if (
      token !== this.lifecycleToken ||
      this.state !== 'closing' ||
      this.currentPanelId !== closingPanelId
    ) {
      return;
    }

    const snapshotPanelId = this.presentedPanelId;
    const currentView = this.webPanelHost.getView(this.presentedPanelId);
    const snapshotDataUrl = await this.captureViewSnapshot(currentView);
    if (snapshotPanelId) {
      if (snapshotDataUrl) {
        this.snapshots.set(snapshotPanelId, snapshotDataUrl);
      }

      await sleep(SNAPSHOT_PAINT_MS);
    }

    if (
      token !== this.lifecycleToken ||
      this.state !== 'closing' ||
      this.currentPanelId !== closingPanelId
    ) {
      return;
    }

    const descriptor = snapshotPanelId
      ? this.getDescriptor(config, snapshotPanelId)
      : null;
    if (descriptor) {
      this.sendAnimationClose(
        descriptor,
        config.layout.edge,
        snapshotDataUrl ?? this.snapshots.get(descriptor.id) ?? null,
        CLOSE_ANIMATION_DELAY_MS,
        config.appearance
      );
    }

    await sleep(CLOSE_HANDOFF_PAINT_MS);
    if (
      token !== this.lifecycleToken ||
      this.state !== 'closing' ||
      this.currentPanelId !== closingPanelId
    ) {
      return;
    }

    this.panelWindow.hide();
    this.webPanelHost.applyMuteState(
      currentView ? snapshotPanelId : null,
      !config.behavior.keepAudioOnHide
    );

    if (currentView) {
      currentView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }

    await sleep(CLOSE_ANIMATION_MS);
    if (
      token !== this.lifecycleToken ||
      this.state !== 'closing' ||
      this.currentPanelId !== closingPanelId
    ) {
      return;
    }

    this.panelWindowRef.setIgnoreMouseEvents(true, { forward: true });
    this.hideAnimationWindow();
    this.stopPointerTracking();
    this.clearPresentedPanel();

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
    this.cancelCloseTimer();
    this.pointerOutsideSince = null;
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
    return this.presentedPanelId;
  }

  async getMenuState(
    panelId: string
  ): Promise<import('../../shared/types').PanelMenuState | null> {
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
      case 'copy-link': {
        const result = await this.webPanelHost.copyLink(panelId);
        if (result && !this.panelWindowRef.isDestroyed()) {
          this.panelWindowRef.webContents.send(IPC_CHANNELS.panelCopyToast);
        }
        return result;
      }
      case 'toggle-mobile-view':
        return this.webPanelHost.toggleMobileView(panelId);
      case 'toggle-notifications-snooze':
        return this.webPanelHost.toggleNotificationsSnooze(panelId);
      case 'toggle-translate':
        return this.webPanelHost.toggleTranslate(panelId);
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

  async openMenu(
    anchor: import('../../shared/types').PanelMenuAnchor
  ): Promise<void> {
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

  async clearAllWebStorageData(): Promise<void> {
    await this.webPanelHost.clearAllStorageData();
  }

  async flushWebPanelCookies(): Promise<void> {
    await this.webPanelHost.flushCookies();
  }

  /**
   * PRD §5.8.2 切换贴边方向前的强制关闭：
   * - 取消所有计时器/动画 token
   * - 重置 panelMode 至 hover、清 sticky
   * - 同步隐藏 panel/animation 窗口（不走收起动画 — PRD 要求"无动画"）
   * - view bounds 归零，等待下次 hoverPanel 时重新挂载
   */
  forceCloseAndResetMode(nextEdge?: Edge, nextDisplayId?: number): void {
    this.cancelActiveResize();
    this.cancelCloseTimer();
    this.closeMenu();
    this.stopPointerTracking();
    this.lifecycleToken++;
    this.switchToken++;
    this.showPanelToken++;

    if (this.presentedPanelId) {
      const view = this.webPanelHost.getView(this.presentedPanelId);
      if (view) {
        view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      }
    }

    this.panelWindow.hide();
    this.panelWindowRef.setIgnoreMouseEvents(true, { forward: true });
    this.hideAnimationWindow();

    this.panelMode = 'hover';
    this.sticky = false;
    this.resizeReleaseGuardPoint = null;
    this.pointerOutsideSince = null;
    this.pendingDestroyId = null;
    this.state = 'closed';
    this.currentPanelId = null;
    this.clearPresentedPanel();
    if (nextEdge) {
      this.edge = nextEdge;
    }
    if (nextDisplayId !== undefined) {
      this.displayId = nextDisplayId;
    }
    this.emitState(this.edge, this.panelMode);
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

  startNativeResize(point: Electron.Point): void {
    if (this.state !== 'open' || this.nativeResizeActive) return;
    this.beginNativeResize();
    if (!this.panelWindow.startNativeResize(this.edge, point)) {
      this.cancelActiveResize();
    }
  }

  private beginNativeResize(): void {
    if (this.nativeResizeActive) return;
    this.nativeResizeActive = true;
    this.resizeReleaseGuardPoint = null;
    this.cancelCloseTimer();
    this.pointerOutsideSince = null;
    this.sendResizeState(true);
  }

  private finishNativeResize(): void {
    if (!this.nativeResizeActive) return;
    this.nativeResizeActive = false;
    const width = this.panelWindowRef.getBounds().width;
    this.panelWindow.rememberNativeWidth(this.edge, width);
    const releasePoint = screen.getCursorScreenPoint();
    this.sendResizeState(false);
    void this.commitResize(width, releasePoint).catch((error) => {
      logger.error('Failed to persist panel resize', error);
    });
  }

  private async commitResize(
    newWidth: number,
    releasePoint: Electron.Point
  ): Promise<void> {
    this.cancelCloseTimer();
    this.pointerOutsideSince = null;
    const display = getTargetDisplay(this.displayId);
    const width = _clampPanelWidth(
      newWidth,
      display.workArea.width,
      this.panelMaxWidthPercent
    );

    const currentBoundsWidth = this.panelWindowRef.getBounds().width;
    const currentContentWidth =
      this.panelWindowRef.contentView.getBounds().width;
    const adjustedAfterResize = currentBoundsWidth !== width;
    const contentWidthOverride = adjustedAfterResize
      ? Math.max(0, width - (currentBoundsWidth - currentContentWidth))
      : undefined;
    if (adjustedAfterResize) {
      this.panelWindow.updateBounds(this.edge, width, this.displayId);
    }
    // animationWindow 在 commit 保留同步，保证下次 open/close 动画 bounds 正确
    this.animationWindow.updateBounds(this.edge, width, this.displayId);

    const resizedPanelId = this.presentedPanelId;
    const view = resizedPanelId
      ? this.webPanelHost.getView(resizedPanelId)
      : null;
    if (view) {
      // The root content view is the authoritative child-layout coordinate space.
      this.updateViewBounds(view, this.edge, contentWidthOverride);
    }

    if (this.panelMode === 'hover') {
      this.sticky = false;
      this.resizeReleaseGuardPoint = this.isCursorInsideInteractiveArea(
        releasePoint
      )
        ? null
        : releasePoint;
    } else {
      this.resizeReleaseGuardPoint = null;
    }

    // Re-emitting the current state also refreshes the pinned AppBar bounds.
    this.emitState(this.edge, this.panelMode);

    // Bug 14: 当前 panel 是用户自定义 panel 时，同时写入 per-panel preferredWidth，
    // 否则 applyPanelBounds 永远读取 descriptor.preferredWidth 初值，panelDefaultWidth 不起作用。
    // builtin descriptor（add-site / edit-site / site-info）不持久化 preferredWidth。
    const config = await this.configStore.read();
    const builtinRoute = resizedPanelId
      ? parseBuiltinPanelId(resizedPanelId)
      : null;
    const isBuiltin = builtinRoute !== null;
    const matchesUserPanel =
      !isBuiltin &&
      resizedPanelId != null &&
      config.panels.some((p) => p.id === resizedPanelId);

    if (matchesUserPanel) {
      const nextPanels = config.panels.map((p) =>
        p.id === resizedPanelId ? { ...p, preferredWidth: width } : p
      );
      await this.configStore.update({ panels: nextPanels });
    } else if (isBuiltin && resizedPanelId) {
      this.builtinPreferredWidths.set(resizedPanelId, width);
    }
  }

  private async switchPanel(
    descriptor: PanelDescriptor,
    edge: Edge,
    appearance?: AppearanceConfig
  ): Promise<void> {
    const token = ++this.switchToken;
    this.pendingDestroyId = null;
    if (this.panelMode === 'hover') {
      this.sticky = false;
    }
    this.closeMenu();

    this.panelWindowRef.webContents.send(IPC_CHANNELS.chromeFadeOut);
    await sleep(60);
    if (token !== this.switchToken || this.currentPanelId !== descriptor.id) {
      return;
    }

    const view = this.prepareView(descriptor, edge);
    const isLoading =
      descriptor.type === 'web' &&
      this.webPanelHost.isViewLoading(descriptor.id);
    if (!this.commitPresentedPanel(descriptor.id, view)) return;

    if (descriptor.type === 'web') {
      this.webPanelHost.applyMuteState(descriptor.id, false);
    }

    this.panelWindowRef.webContents.send(IPC_CHANNELS.chromeFadeIn, {
      descriptor,
      edge,
      url: this.getDescriptorUrl(descriptor),
      appearance,
      isLoading
    });

    this.emitState(this.edge, this.panelMode);

    this.state = 'open';

    if (descriptor.id === BUILTIN_SETTINGS_ID) {
      this.panelWindowRef.focus();
    }
  }

  private prepareView(
    descriptor: PanelDescriptor,
    edge: Edge
  ): BrowserView | null {
    if (descriptor.type !== 'web') {
      return null;
    }
    const view = this.webPanelHost.getOrCreateView(descriptor);
    this.updateViewBounds(view, edge);
    this.bindViewEvents(descriptor, view);
    return view;
  }

  private panelMaxWidthPercent = 60;

  private applyHoverConfig(config: AppConfig): void {
    this.edge = config.layout.edge;
    // Use cursor position to detect which screen the user is interacting with.
    // config.layout.displayId may be unset — defaults to primary.
    this.displayId =
      config.layout.displayId ??
      screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
    this.hoverCloseDelayMs = config.behavior.hoverCloseDelayMs;
    const raw = config.layout.panelDefaultWidth;
    this.panelMaxWidthPercent = raw >= 25 && raw <= 100 ? raw : 50;
    const display = getTargetDisplay(this.displayId);
    this.panelWindow.setResizeLimits(
      display.workArea.width,
      this.panelMaxWidthPercent
    );
  }

  private applyPanelBounds(
    descriptor: PanelDescriptor,
    config: AppConfig
  ): void {
    const display = getTargetDisplay(config.layout.displayId);
    const workAreaWidth = display.workArea.width;
    const maxPercent =
      config.layout.panelDefaultWidth >= 25 &&
      config.layout.panelDefaultWidth <= 100
        ? config.layout.panelDefaultWidth
        : 50;
    const { min: minWidthPx } = getPanelWidthRange(workAreaWidth, maxPercent);
    const preferredWidth = getPreferredPanelWidth(
      descriptor.preferredWidth,
      minWidthPx,
      workAreaWidth
    );
    const panelWidth = _clampPanelWidth(
      preferredWidth,
      workAreaWidth,
      maxPercent
    );

    this.panelWindow.setResizeLimits(workAreaWidth, maxPercent);
    this.panelWindow.updateBounds(
      config.layout.edge,
      panelWidth,
      config.layout.displayId
    );
    this.animationWindow.updateBounds(
      config.layout.edge,
      panelWidth,
      config.layout.displayId
    );
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
    if (this.state === 'closed') {
      this.pointerOutsideSince = null;
      return;
    }

    if (
      this.nativeResizeActive ||
      this.sticky ||
      this.panelMode === 'pinned' ||
      this.isHideMuted()
    ) {
      this.pointerOutsideSince = null;
      return;
    }

    if (this.resizeReleaseGuardPoint) {
      const cursor = screen.getCursorScreenPoint();
      if (this.isCursorInsideInteractiveArea(cursor)) {
        this.resizeReleaseGuardPoint = null;
        this.pointerOutsideSince = null;
        this.cancelCloseTimer();
        return;
      }
      const moved =
        Math.abs(cursor.x - this.resizeReleaseGuardPoint.x) +
        Math.abs(cursor.y - this.resizeReleaseGuardPoint.y);
      if (moved < RESIZE_RELEASE_MOVE_THRESHOLD) return;
      this.resizeReleaseGuardPoint = null;
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
      // If state is stuck in 'closing' (hidePanel returned early), force reset
      if (this.state === 'closing') {
        logger.info('Force-closing stuck panel');
        this.forceClosePanel();
        return;
      }
      void this.hidePanel(false);
    }
  }

  /** Force close panel when hidePanel lifecycle was interrupted */
  private forceClosePanel(): void {
    this.cancelActiveResize();
    this.cancelCloseTimer();
    this.closeMenu();
    this.lifecycleToken++;
    this.switchToken++;
    this.showPanelToken++;
    if (this.presentedPanelId) {
      const view = this.webPanelHost.getView(this.presentedPanelId);
      if (view) {
        view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      }
    }
    this.panelWindow.hide();
    this.panelWindowRef.setIgnoreMouseEvents(true, { forward: true });
    this.hideAnimationWindow();
    this.stopPointerTracking();
    this.state = 'closed';
    this.currentPanelId = null;
    this.clearPresentedPanel();
    this.sticky = false;
    this.resizeReleaseGuardPoint = null;
    this.pendingDestroyId = null;
    this.emitState(this.edge, this.panelMode);
  }

  private isCursorInsideInteractiveArea(
    cursor = screen.getCursorScreenPoint()
  ): boolean {
    const panelBounds = this.panelWindowRef.getBounds();
    const dockBounds = getDockBounds(this.edge, this.displayId);
    const menuBrowserWindow = this.menuWindow.getBrowserWindow();
    const menuBounds =
      menuBrowserWindow && menuBrowserWindow.isVisible()
        ? menuBrowserWindow.getBounds()
        : null;

    return (
      this.isPointInsideBounds(cursor, panelBounds) ||
      this.isPointInsideBounds(cursor, dockBounds) ||
      (menuBounds ? this.isPointInsideBounds(cursor, menuBounds) : false)
    );
  }

  private isPointInsideBounds(
    point: Electron.Point,
    bounds:
      | Electron.Rectangle
      | { x: number; y: number; width: number; height: number }
  ): boolean {
    return (
      point.x >= bounds.x - POINTER_TRACK_MARGIN &&
      point.x <= bounds.x + bounds.width + POINTER_TRACK_MARGIN &&
      point.y >= bounds.y - POINTER_TRACK_MARGIN &&
      point.y <= bounds.y + bounds.height + POINTER_TRACK_MARGIN
    );
  }

  private presentDescriptorView(descriptor: PanelDescriptor, edge: Edge): void {
    if (descriptor.type !== 'web') {
      this.commitPresentedPanel(descriptor.id, null);
      return;
    }

    const view = this.webPanelHost.getOrCreateView(descriptor);
    this.updateViewBounds(view, edge);
    this.bindViewEvents(descriptor, view);
    this.webPanelHost.applyMuteState(descriptor.id, false);
    this.commitPresentedPanel(descriptor.id, view);
  }

  private commitPresentedPanel(
    panelId: string,
    view: BrowserView | null
  ): boolean {
    if (this.currentPanelId !== panelId) return false;
    if (
      view &&
      (view.webContents.isDestroyed() ||
        this.webPanelHost.getView(panelId) !== view)
    ) {
      return false;
    }
    if (!this.setActiveView(view)) return false;
    this.presentedPanelId = panelId;
    return true;
  }

  private clearPresentedPanel(): void {
    if (this.setActiveView(null)) {
      this.presentedPanelId = null;
    }
  }

  /** `presentedPanelId` 只能在窗口确认唯一网页视图后提交。 */
  private setActiveView(view: BrowserView | null): boolean {
    try {
      this.panelWindowRef.setBrowserView(view);
      if (this.panelWindowRef.getBrowserView() !== view) {
        logger.error('Panel BrowserView commit did not take effect');
        return false;
      }
      return true;
    } catch (error) {
      logger.error('Failed to commit Panel BrowserView', error);
      return false;
    }
  }

  private updateViewBounds(
    view: BrowserView,
    edge: Edge,
    overrideContentWidth?: number
  ): void {
    const { width: rawWidth, height } =
      this.panelWindowRef.contentView.getBounds();
    const width =
      overrideContentWidth != null ? overrideContentWidth : rawWidth;
    const sideInsetLeft = edge === 'right' ? CONTENT_INSET : 0;
    const sideInsetRight = edge === 'left' ? CONTENT_INSET : 0;
    const dockSideBorderWidth = 0;
    const outerSideBorderWidth = PANEL_BORDER_WIDTH;
    const leftBorderWidth =
      edge === 'right' ? outerSideBorderWidth : dockSideBorderWidth;
    const rightBorderWidth =
      edge === 'left' ? outerSideBorderWidth : dockSideBorderWidth;
    const innerWidth = width - sideInsetLeft - sideInsetRight;

    view.setBounds({
      x: sideInsetLeft + leftBorderWidth,
      y: PANEL_TOP_INSET + CHROME_HEIGHT,
      width: Math.max(0, innerWidth - leftBorderWidth - rightBorderWidth),
      height: Math.max(
        0,
        height -
          PANEL_TOP_INSET -
          CHROME_HEIGHT -
          CONTENT_INSET -
          PANEL_BORDER_WIDTH
      )
    });
  }

  private bindViewEvents(descriptor: PanelDescriptor, view: BrowserView): void {
    if ((view.webContents as WebContentsWithMeta).__sidebarBound) {
      return;
    }

    (view.webContents as WebContentsWithMeta).__sidebarBound = true;

    view.webContents.on('before-input-event', (_event, input) => {
      this.cancelCloseTimer();
      this.pointerOutsideSince = null;
    });
  }

  private sendAnimateIn(
    descriptor: PanelDescriptor,
    edge: Edge,
    snapshotDataUrl: string | null,
    appearance?: AppearanceConfig
  ): void {
    this.panelWindowRef.webContents.send(IPC_CHANNELS.panelAnimateIn, {
      panelId: descriptor.id,
      descriptor,
      edge,
      url: this.getDescriptorUrl(descriptor),
      snapshotDataUrl,
      appearance
    });
  }

  private sendAnimationOpen(
    descriptor: PanelDescriptor,
    edge: Edge,
    snapshotDataUrl: string | null,
    appearance?: AppearanceConfig
  ): void {
    this.coverPanelWithAnimation();
    this.animationWindowRef.webContents.send(IPC_CHANNELS.panelAnimationOpen, {
      panelId: descriptor.id,
      descriptor,
      edge,
      url: this.getDescriptorUrl(descriptor),
      snapshotDataUrl,
      appearance
    });
  }

  private sendAnimationClose(
    descriptor: PanelDescriptor,
    edge: Edge,
    snapshotDataUrl: string | null,
    animationDelayMs = 0,
    appearance?: AppearanceConfig
  ): void {
    this.animationWindowRef.webContents.send(IPC_CHANNELS.panelAnimationClose, {
      panelId: descriptor.id,
      descriptor,
      edge,
      url: this.getDescriptorUrl(descriptor),
      snapshotDataUrl,
      animationDelayMs,
      appearance
    });
  }

  private resetAnimationWindow(): void {
    this.animationWindowRef.webContents.send(IPC_CHANNELS.panelAnimationReset);
  }

  private hideAnimationWindow(): void {
    this.animationWindow.hide();
  }

  private coverPanelWithAnimation(): void {
    this.animationWindowRef.setAlwaysOnTop(true, 'screen-saver');
    this.animationWindowRef.moveTop();
    this.dockWindowRef.moveTop();
  }

  private revealPanelWindow(): void {
    this.panelWindowRef.setAlwaysOnTop(true, 'screen-saver');
    this.panelWindowRef.moveTop();
    this.dockWindowRef.moveTop();
  }

  private async captureViewSnapshot(
    view: BrowserView | null
  ): Promise<string | null> {
    if (!view || view.webContents.isDestroyed()) {
      return null;
    }

    // AppBar 注册后 Windows 需要 ~600ms 稳定 work area；
    // capturePage 可能触发 display-metrics-changed 导致 AppBar 闪烁
    if (Date.now() - this.createdAt < 800) {
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
      activePanelId: this.presentedPanelId,
      panelVisible,
      panelMode,
      edge
    });
  }

  private sendResizeState(active: boolean): void {
    if (!this.panelWindowRef.isDestroyed()) {
      this.panelWindowRef.webContents.send(
        IPC_CHANNELS.panelResizeState,
        active
      );
    }
  }

  private emitNavigation(
    panelId: string,
    url: string,
    canGoBack?: boolean
  ): void {
    this.panelWindowRef.webContents.send(IPC_CHANNELS.panelNavigationState, {
      panelId,
      url,
      canGoBack:
        canGoBack ??
        this.webPanelHost.getView(panelId)?.webContents.canGoBack() ??
        false
    });
  }

  private emitLoading(panelId: string, isLoading: boolean): void {
    if (this.panelWindowRef.isDestroyed()) return;
    this.panelWindowRef.webContents.send(IPC_CHANNELS.panelLoadingState, {
      panelId,
      isLoading
    });
  }

  private getDescriptor(
    config: AppConfig,
    panelId: string
  ): PanelDescriptor | null {
    return (
      createBuiltinPanelDescriptor(
        panelId,
        this.builtinPreferredWidths.get(panelId)
      ) ??
      config.panels.find((panel) => panel.id === panelId) ??
      null
    );
  }

  private isAutoHideBlocked(): boolean {
    return (
      this.nativeResizeActive ||
      this.sticky ||
      this.resizeReleaseGuardPoint !== null ||
      this.panelMode === 'pinned' ||
      this.isHideMuted() ||
      this.isCursorInsideInteractiveArea()
    );
  }

  private cancelActiveResize(): void {
    if (!this.nativeResizeActive) return;
    this.nativeResizeActive = false;
    this.sendResizeState(false);
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
