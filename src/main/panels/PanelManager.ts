import { BrowserWindow, screen, WebContentsView } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { AppConfig, Edge, PanelDescriptor, PanelState } from '../../shared/types';
import { logger } from '../utils/logger';
import type { ConfigStore } from '../store/ConfigStore';
import type { PanelAnimationWindow } from '../windows/PanelAnimationWindow';
import type { PanelWindow } from '../windows/PanelWindow';
import { getDockBounds } from '../utils/display';
import { WebPanelHost } from './WebPanelHost';

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
  private readonly webPanelHost = new WebPanelHost();
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
  private pinned = false;
  private edge: Edge = 'right';
  private hoverCloseDelayMs = 300;
  private pendingDestroyId: string | null = null;
  private readonly snapshots = new Map<string, string>();

  constructor(
    private readonly configStore: ConfigStore,
    panelWindow: PanelWindow,
    animationWindow: PanelAnimationWindow,
    private readonly emitPanelState: (state: PanelState) => void
  ) {
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
  }

  async hoverPanel(panelId: string): Promise<void> {
    this.sticky = false;
    await this.showPanel(panelId);
  }

  async showPanel(panelId: string, sticky = false): Promise<void> {
    const config = await this.configStore.read();
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
        this.panelWindowRef.setOpacity(1);
        this.panelWindowRef.setIgnoreMouseEvents(false);
        this.resetAnimationWindow();
      }

      await this.switchPanel(descriptor, config.layout.edge);
      this.emitState(config.layout.edge, config.layout.pinned);
      return;
    }

    if (this.currentPanelId === panelId && this.state === 'open') {
      this.emitState(config.layout.edge, config.layout.pinned);
      return;
    }

    this.state = 'opening';
    const token = ++this.lifecycleToken;
    this.currentPanelId = panelId;
    this.pendingDestroyId = null;
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
    this.resetAnimationWindow();
    this.cancelCloseTimer();
    this.state = 'open';
    this.emitState(config.layout.edge, config.layout.pinned);
  }

  scheduleHide(destroy = false): void {
    this.cancelCloseTimer();
    void this.configStore.read().then((config) => {
      this.applyHoverConfig(config);
      if (this.sticky || config.layout.pinned) {
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
    const closingPanelId = this.currentPanelId;
    this.cancelCloseTimer();
    this.state = 'closing';
    const token = ++this.lifecycleToken;
    this.pendingDestroyId = destroy ? this.currentPanelId : this.pendingDestroyId;

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
    this.emitState(config.layout.edge, config.layout.pinned);
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

  private async switchPanel(descriptor: PanelDescriptor, edge: Edge): Promise<void> {
    const token = ++this.switchToken;
    this.pendingDestroyId = null;
    this.sticky = false;

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
    this.pinned = config.layout.pinned;
    this.hoverCloseDelayMs = config.behavior.hoverCloseDelayMs;
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

    if (this.sticky || this.pinned) {
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

    return this.isPointInsideBounds(cursor, panelBounds) || this.isPointInsideBounds(cursor, dockBounds);
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

    view.webContents.on('did-navigate', () => {
      this.emitNavigation(descriptor.id, this.webPanelHost.getCurrentUrl(descriptor.id, this.getDescriptorUrl(descriptor)));
    });

    view.webContents.on('did-navigate-in-page', () => {
      this.emitNavigation(descriptor.id, this.webPanelHost.getCurrentUrl(descriptor.id, this.getDescriptorUrl(descriptor)));
    });

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

  private emitState(edge: Edge, pinned: boolean): void {
    this.emitPanelState({
      activePanelId: this.currentPanelId,
      pinned,
      edge
    });
  }

  private emitNavigation(panelId: string, url: string): void {
    this.panelWindowRef.webContents.send(IPC_CHANNELS.panelNavigationState, {
      panelId,
      url
    });
  }

  private getDescriptor(config: AppConfig, panelId: string): PanelDescriptor | null {
    return config.panels.find((panel) => panel.id === panelId) ?? null;
  }

  private getDescriptorUrl(descriptor: PanelDescriptor): string {
    return descriptor.web?.url ?? 'about:blank';
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
