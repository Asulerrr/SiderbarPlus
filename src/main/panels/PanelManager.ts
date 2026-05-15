import { BrowserWindow, screen, WebContentsView } from 'electron';
import { BUILTIN_ADD_SITE_ID, BUILTIN_SETTINGS_ID } from '../../shared/constants';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import { buildBuiltinPanelId, parseBuiltinPanelId } from '../../shared/builtinPanels';
import type { AppConfig, Edge, PanelDescriptor, PanelState, SiteInfo } from '../../shared/types';
import { logger } from '../utils/logger';
import type { ConfigStore } from '../store/ConfigStore';
import type { PanelAnimationWindow } from '../windows/PanelAnimationWindow';
import type { PanelMenuWindow } from '../windows/PanelMenuWindow';
import type { PanelWindow } from '../windows/PanelWindow';
import { getDockBounds, getTargetDisplay } from '../utils/display';
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
  private lastResizeDragWidth: number | null = null;
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
        this.emitNavigation(payload.panelId, payload.url, payload.canGoBack),
      emitLoading: (payload) => this.emitLoading(payload.panelId, payload.isLoading)
    });
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

      ++this.lifecycleToken;
      this.currentPanelId = panelId;
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
      if (BrowserWindow.getFocusedWindow()) {
        return;
      }
      if (this.panelMode === 'pinned') {
        return;
      }
      if (this.currentPanelId === BUILTIN_SETTINGS_ID && this.state === 'open') {
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
      if (this.sticky || this.panelMode === 'pinned' || this.isHideMuted()) {
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

  /**
   * PRD §5.8.2 切换贴边方向前的强制关闭：
   * - 取消所有计时器/动画 token
   * - 重置 panelMode 至 hover、清 sticky
   * - 同步隐藏 panel/animation 窗口（不走收起动画 — PRD 要求"无动画"）
   * - view bounds 归零，等待下次 hoverPanel 时重新挂载
   */
  forceCloseAndResetMode(nextEdge?: Edge, nextDisplayId?: number): void {
    this.cancelCloseTimer();
    this.closeMenu();
    this.stopPointerTracking();
    this.lifecycleToken++;
    this.switchToken++;

    if (this.currentPanelId) {
      const view = this.webPanelHost.getView(this.currentPanelId);
      if (view) {
        view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      }
    }

    this.panelWindowRef.setOpacity(0);
    this.panelWindowRef.setIgnoreMouseEvents(true, { forward: true });
    this.hideAnimationWindow();

    this.panelMode = 'hover';
    this.sticky = false;
    this.lastResizeDragWidth = null;
    this.pointerOutsideSince = null;
    this.pendingDestroyId = null;
    this.state = 'closed';
    this.currentPanelId = null;
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
      this.lastResizeDragWidth = null;
      this.cancelCloseTimer();
      this.emitState(this.edge, this.panelMode);
      return;
    }
    this.panelMode = 'hover';
    this.lastResizeDragWidth = null;
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
    if (this.state !== 'open') {
      return;
    }
    // Bug 2: clamp must use dock's display, not cursor's display.
    // 双屏下鼠标可能在另一屏，但 dock 在 displayId 指定屏，必须用该屏 workArea 约束宽度。
    const display = getTargetDisplay(this.displayId);
    const width = _clampPanelWidth(newWidth, display.workArea.width, this.panelMaxWidthPercent);
    // Bug 3: 宽度未变化时跳过 setBounds，避免 Windows 相同 bounds 仍重绘闪烁。
    if (this.lastResizeDragWidth === width) {
      return;
    }
    this.lastResizeDragWidth = width;
    this.panelWindow.updateBounds(this.edge, width, this.displayId);
    // Bug 13: 拖拽期间不动 animationWindow，避免双 transparent 窗口同帧 setBounds 频闪
    // 不动 view；chrome 在 view 前方覆盖"拉出"区域
  }

  async commitResize(newWidth: number): Promise<void> {
    // Bug 3: 拖拽结束，重置去重缓存，下次拖拽干净起步。
    this.lastResizeDragWidth = null;
    // mouseup 终点：一次性对齐 view + 持久化 panelDefaultWidth
    // Bug 2: 同 resizeDrag，用 dock 所在屏 workArea。
    const display = getTargetDisplay(this.displayId);
    const width = _clampPanelWidth(newWidth, display.workArea.width, this.panelMaxWidthPercent);

    this.panelWindow.updateBounds(this.edge, width, this.displayId);
    // animationWindow 在 commit 保留同步，保证下次 open/close 动画 bounds 正确
    this.animationWindow.updateBounds(this.edge, width, this.displayId);

    const view = this.currentPanelId
      ? this.webPanelHost.getView(this.currentPanelId)
      : null;
    if (view) {
      // Bug 11: 复用 updateViewBounds 计算正确 inset/border，而非简化算法
      // Bug 4: panelWindow.setBounds 后 getContentSize 可能返回旧值（Windows 原生消息时序），
      // 显式传入 width 确保 view bounds 按新宽度计算，网页渲染同步放大。
      this.updateViewBounds(view, this.edge, width);
    }

    // Bug 14: 当前 panel 是用户自定义 panel 时，同时写入 per-panel preferredWidth，
    // 否则 applyPanelBounds 永远读取 descriptor.preferredWidth 初值，panelDefaultWidth 不起作用。
    // builtin descriptor（add-site / edit-site / site-info）不持久化 preferredWidth。
    const config = await this.configStore.read();
    const builtinRoute = this.currentPanelId ? parseBuiltinPanelId(this.currentPanelId) : null;
    const isBuiltin = builtinRoute !== null;
    const matchesUserPanel =
      !isBuiltin &&
      this.currentPanelId != null &&
      config.panels.some((p) => p.id === this.currentPanelId);

    if (matchesUserPanel) {
      const nextPanels = config.panels.map((p) =>
        p.id === this.currentPanelId ? { ...p, preferredWidth: width } : p
      );
      await this.configStore.update({ panels: nextPanels });
    } else if (isBuiltin && this.currentPanelId) {
      this.builtinPreferredWidths.set(this.currentPanelId, width);
    }

    // hover 模式下，拖动期间通过父容器 mousedown 设置了 sticky=true，
    // 拖完需主动清掉，否则鼠标离开 panel 也不会触发收回。
    // pinned 模式不依赖 sticky（scheduleHide 内有 panelMode 检查）。
    if (this.panelMode === 'hover') {
      this.sticky = false;
    }
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

    this.attachDescriptorView(descriptor, edge);
    if (descriptor.type === 'web') {
      this.webPanelHost.applyMuteState(descriptor.id, false);
    }

    this.panelWindowRef.webContents.send(IPC_CHANNELS.chromeFadeIn, {
      descriptor,
      edge,
      url: this.getDescriptorUrl(descriptor)
    });

    this.currentPanelId = descriptor.id;
    this.state = 'open';

    // 同 showPanel：settings 面板需要取焦点以支持点击外部自动收起。
    if (descriptor.id === BUILTIN_SETTINGS_ID) {
      this.panelWindowRef.focus();
    }
  }

  private panelMaxWidthPercent = 60;

  private applyHoverConfig(config: AppConfig): void {
    this.edge = config.layout.edge;
    // Use cursor position to detect which screen the user is interacting with.
    // config.layout.displayId may be unset — defaults to primary.
    this.displayId = config.layout.displayId ??
      screen.getDisplayNearestPoint(screen.getCursorScreenPoint()).id;
    this.hoverCloseDelayMs = config.behavior.hoverCloseDelayMs;
    const raw = config.layout.panelDefaultWidth;
    this.panelMaxWidthPercent = raw >= 25 && raw <= 100 ? raw : 50;
  }

  private applyPanelBounds(descriptor: PanelDescriptor, config: AppConfig): void {
    const display = getTargetDisplay(config.layout.displayId);
    const workAreaWidth = display.workArea.width;
    const minWidthPx = Math.max(360, Math.round(workAreaWidth * 25 / 100));
    const panelWidth = getPreferredPanelWidth(
      descriptor.preferredWidth,
      minWidthPx,
      workAreaWidth
    );

    this.panelWindow.updateBounds(config.layout.edge, panelWidth, config.layout.displayId);
    this.animationWindow.updateBounds(config.layout.edge, panelWidth, config.layout.displayId);
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

    if (this.sticky || this.panelMode === 'pinned' || this.isHideMuted()) {
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
    this.cancelCloseTimer();
    this.closeMenu();
    if (this.currentPanelId) {
      const view = this.webPanelHost.getView(this.currentPanelId);
      if (view) {
        view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      }
    }
    this.panelWindowRef.setOpacity(0);
    this.panelWindowRef.setIgnoreMouseEvents(true, { forward: true });
    this.hideAnimationWindow();
    this.stopPointerTracking();
    this.state = 'closed';
    this.currentPanelId = null;
    this.sticky = false;
    this.pendingDestroyId = null;
    this.emitState(this.edge, this.panelMode);
  }

  private isCursorInsideInteractiveArea(): boolean {
    const cursor = screen.getCursorScreenPoint();
    const panelBounds = this.panelWindowRef.getBounds();
    const dockBounds = getDockBounds(this.edge, this.displayId);
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
      // 切到 builtin 面板时，确保 contentView 里没有任何残留的 web view，
      // 否则它仍会以最后一次的 z-order / bounds 露出。
      this.setActiveView(null);
      return;
    }

    const view = this.webPanelHost.getOrCreateView(descriptor);
    this.setActiveView(view);
    this.updateViewBounds(view, edge);
    this.bindViewEvents(descriptor, view);
    this.webPanelHost.applyMuteState(descriptor.id, false);
  }

  /**
   * 任意时刻 panelWindow.contentView 内只保留一个目标 view（或 null）。
   * 旧实现仅把旧 view 缩到 0×0 但不卸载，多次切换后 children 数组会累积，
   * z-order 由历史 add 顺序决定，偶发让"应该看不见"的视图露出。
   */
  private setActiveView(view: WebContentsView | null): void {
    const contentView = this.panelWindowRef.contentView;
    for (const child of [...contentView.children]) {
      if (child !== view) {
        contentView.removeChildView(child);
      }
    }
    if (view && !contentView.children.includes(view)) {
      contentView.addChildView(view);
    }
  }

  private updateViewBounds(
    view: WebContentsView,
    edge: Edge,
    overrideContentWidth?: number
  ): void {
    const [rawWidth, height] = this.panelWindowRef.getContentSize();
    const width = overrideContentWidth != null ? overrideContentWidth : rawWidth;
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
    this.dockWindowRef.moveTop();
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
    // 把 dock 抬回最上层——panel/animation 动画不应遮盖 dock
    this.dockWindowRef.moveTop();
  }

  private async captureViewSnapshot(view: WebContentsView | null): Promise<string | null> {
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

  private emitLoading(panelId: string, isLoading: boolean): void {
    if (this.panelWindowRef.isDestroyed()) return;
    this.panelWindowRef.webContents.send(IPC_CHANNELS.panelLoadingState, {
      panelId,
      isLoading
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
        preferredWidth: this.builtinPreferredWidths.get(BUILTIN_ADD_SITE_ID),
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
        preferredWidth: this.builtinPreferredWidths.get(panelId),
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
        preferredWidth: this.builtinPreferredWidths.get(panelId),
        builtin: {
          widgetId: 'site-info',
          targetPanelId: builtinRoute.targetPanelId
        }
      };
    }

    if (builtinRoute?.widgetId === 'settings') {
      return {
        id: BUILTIN_SETTINGS_ID,
        type: 'builtin',
        title: '设置',
        iconSource: {
          kind: 'letter',
          fallbackLetter: '⚙',
          fallbackColor: '#3a3a3a'
        },
        order: -1,
        preferredWidth: this.builtinPreferredWidths.get(BUILTIN_SETTINGS_ID),
        builtin: {
          widgetId: 'settings'
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
