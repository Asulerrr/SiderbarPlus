import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { parseHex8, resolveSurfaceColors } from '../../shared/theme';
import type { AppConfig } from '../../shared/types';
import { getPanelWidthRange } from '../panels/panelResize';
import { startNativeWindowResize } from '../services/NativeWindowResize';
import { getDockBounds, getTargetDisplay } from '../utils/display';
import { type WindowBounds, getPanelBounds, percentToPanelPx } from '../utils/panelBounds';

const getPanelBackgroundColor = (config: AppConfig): string => {
  const surface = resolveSurfaceColors(config.appearance, true);
  const { r, g, b } = parseHex8(surface.bg);
  const hex = (value: number): string => value.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
};

const getResizeBackdropDataUrl = (config: AppConfig): string => {
  const color = getPanelBackgroundColor(config);
  const html = `<!doctype html><html style="background:${color}"><head><meta charset="utf-8"><style>html,body{width:100%;height:100%;margin:0;overflow:hidden;background:${color}}</style></head><body></body></html>`;
  return `data:text/html;charset=utf-8,${encodeURIComponent(html)}`;
};

export class PanelWindow {
  private window: BrowserWindow | null = null;
  private resizeBackdrop: BrowserWindow | null = null;
  private resizeBackdropHideTimer: NodeJS.Timeout | null = null;
  private lastPanelWidth: number;
  private lastEdge: AppConfig['layout']['edge'];

  constructor(private config: AppConfig) {
    const widthPx = percentToPanelPx(
      config.layout.panelDefaultWidth,
      getTargetDisplay(config.layout.displayId).workArea.width
    );
    this.lastPanelWidth = widthPx;
    this.lastEdge = config.layout.edge;
  }

  updateConfig(config: AppConfig): void {
    this.config = config;
    if (this.resizeBackdrop && !this.resizeBackdrop.isDestroyed()) {
      this.resizeBackdrop.setBackgroundColor(getPanelBackgroundColor(config));
      void this.resizeBackdrop.loadURL(getResizeBackdropDataUrl(config));
    }
  }

  create(): BrowserWindow {
    const dockBounds = getDockBounds(this.config.layout.edge, this.config.layout.displayId);
    const display = getTargetDisplay(this.config.layout.displayId);
    const maxWidthPercent =
      this.config.layout.panelDefaultWidth >= 25 && this.config.layout.panelDefaultWidth <= 100
        ? this.config.layout.panelDefaultWidth
        : 50;
    const widthPx = percentToPanelPx(
      this.config.layout.panelDefaultWidth,
      display.workArea.width
    );
    const widthRange = getPanelWidthRange(
      display.workArea.width,
      maxWidthPercent
    );
    const panelBounds = getPanelBounds(
      this.config.layout.edge,
      dockBounds,
      widthPx
    );

    this.window = new BrowserWindow({
      ...panelBounds,
      minWidth: widthRange.min,
      maxWidth: widthRange.max,
      minHeight: 480,
      resizable: true,
      frame: false,
      transparent: true,
      show: false,
      hasShadow: false,
      thickFrame: true,
      roundedCorners: false,
      type: 'toolbar',
      skipTaskbar: true,
      backgroundColor: '#00000000',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/panel.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    this.window.setOpacity(0);
    this.window.setIgnoreMouseEvents(true, { forward: true });
    this.window.setAlwaysOnTop(true, 'floating');
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.createResizeBackdrop(panelBounds);
    this.window.once('ready-to-show', () => {
      this.window?.showInactive();
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      void this.window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/panel-chrome/index.html`);
    } else {
      void this.window.loadFile(join(__dirname, '../renderer/panel-chrome/index.html'));
    }

    return this.window;
  }

  getBrowserWindow(): BrowserWindow | null {
    return this.window;
  }

  hide(): void {
    this.hideResizeBackdrop();
    this.window?.hide();
  }

  show(): void {
    this.window?.setAlwaysOnTop(true, 'floating');
    this.window?.moveTop();
    this.assertPosition();
    this.window?.showInactive();
  }

  getContentBounds(): Electron.Rectangle | null {
    return this.window?.getContentBounds() ?? null;
  }

  setResizeLimits(workAreaWidth: number, maxWidthPercent: number): void {
    if (!this.window || this.window.isDestroyed()) return;
    const { min, max } = getPanelWidthRange(workAreaWidth, maxWidthPercent);
    this.window.setMinimumSize(0, 0);
    this.window.setMaximumSize(max, 100_000);
    this.window.setMinimumSize(min, 0);
  }

  rememberNativeWidth(edge: AppConfig['layout']['edge'], panelWidth: number): void {
    this.lastEdge = edge;
    this.lastPanelWidth = panelWidth;
  }

  startNativeResize(edge: AppConfig['layout']['edge'], point: Electron.Point): boolean {
    if (!this.window || this.window.isDestroyed()) return false;
    const resizeEdge = edge === 'right' ? 'left' : 'right';
    const bounds = this.window.getBounds();
    const edgeX = resizeEdge === 'left' ? bounds.x : bounds.x + bounds.width;
    const edgePoint = screen.dipToScreenPoint({ x: edgeX, y: point.y });
    const started = startNativeWindowResize(this.window.getNativeWindowHandle(), resizeEdge, edgePoint);
    if (!started) this.hideResizeBackdrop();
    return started;
  }

  beginResizeBackdrop(): void {
    if (!this.window || this.window.isDestroyed()) return;
    this.showResizeBackdrop(this.window.getBounds());
  }

  updateResizeBackdrop(bounds: Electron.Rectangle): void {
    if (!this.resizeBackdrop || this.resizeBackdrop.isDestroyed()) return;
    this.resizeBackdrop.setBounds(bounds, false);
  }

  finishResizeBackdrop(): void {
    if (this.resizeBackdropHideTimer) clearTimeout(this.resizeBackdropHideTimer);
    // Keep the native surface behind the transparent window until Chromium has
    // composited the final bounds; otherwise the last resize frame can flash.
    this.resizeBackdropHideTimer = setTimeout(() => {
      this.resizeBackdropHideTimer = null;
      this.hideResizeBackdrop();
    }, 50);
  }

  cancelResizeBackdrop(): void {
    this.hideResizeBackdrop();
  }

  updateBounds(
    edge: AppConfig['layout']['edge'],
    panelWidth: number,
    displayId?: number,
    dockBoundsOverride?: WindowBounds
  ): void {
    this.lastPanelWidth = panelWidth;
    this.lastEdge = edge;
    if (!this.window) return;
    const dockBounds = dockBoundsOverride ?? getDockBounds(edge, displayId);
    this.window.setBounds(getPanelBounds(edge, dockBounds, panelWidth));
  }

  /** 用最后一次 updateBounds 的参数强制重设窗口位置（work area 收缩后防 Windows snap） */
  assertPosition(): void {
    if (!this.window || this.window.isDestroyed()) return;
    const dockBounds = getDockBounds(this.lastEdge, this.config.layout.displayId);
    this.window.setBounds(getPanelBounds(this.lastEdge, dockBounds, this.lastPanelWidth));
  }

  destroy(): void {
    this.hideResizeBackdrop();
    if (this.resizeBackdrop && !this.resizeBackdrop.isDestroyed()) {
      this.resizeBackdrop.destroy();
    }
    this.resizeBackdrop = null;
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }

  private createResizeBackdrop(bounds: Electron.Rectangle): void {
    this.resizeBackdrop = new BrowserWindow({
      ...bounds,
      title: 'SideBar Resize Backdrop',
      show: false,
      frame: false,
      transparent: false,
      backgroundColor: getPanelBackgroundColor(this.config),
      focusable: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      hasShadow: false,
      thickFrame: false,
      roundedCorners: false,
      type: 'toolbar',
      skipTaskbar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false
      }
    });
    this.resizeBackdrop.setOpacity(0);
    this.resizeBackdrop.setIgnoreMouseEvents(true);
    this.resizeBackdrop.setAlwaysOnTop(true, 'floating');
    this.resizeBackdrop.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.resizeBackdrop.once('ready-to-show', () => {
      if (!this.resizeBackdrop || this.resizeBackdrop.isDestroyed()) return;
      // Keep a fully painted HWND in DWM's composition tree so a resize never
      // waits for a hidden BrowserWindow's first frame.
      this.resizeBackdrop.showInactive();
    });
    void this.resizeBackdrop.loadURL(getResizeBackdropDataUrl(this.config));
  }

  private showResizeBackdrop(bounds: Electron.Rectangle): void {
    if (!this.window || this.window.isDestroyed()) return;
    if (!this.resizeBackdrop || this.resizeBackdrop.isDestroyed()) {
      this.createResizeBackdrop(bounds);
    }
    if (this.resizeBackdropHideTimer) {
      clearTimeout(this.resizeBackdropHideTimer);
      this.resizeBackdropHideTimer = null;
    }
    this.resizeBackdrop?.setBounds(bounds, false);
    if (this.resizeBackdrop && !this.resizeBackdrop.isVisible()) {
      this.resizeBackdrop.showInactive();
    }
    this.resizeBackdrop?.setOpacity(1);
    this.window.setAlwaysOnTop(true, 'floating');
    this.window.moveTop();
  }

  private hideResizeBackdrop(): void {
    if (this.resizeBackdropHideTimer) {
      clearTimeout(this.resizeBackdropHideTimer);
      this.resizeBackdropHideTimer = null;
    }
    if (this.resizeBackdrop && !this.resizeBackdrop.isDestroyed()) {
      this.resizeBackdrop.setOpacity(0);
    }
  }

}
