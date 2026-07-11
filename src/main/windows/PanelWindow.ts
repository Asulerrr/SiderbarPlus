import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { parseHex8, resolveSurfaceColors } from '../../shared/theme';
import type { AppConfig } from '../../shared/types';
import { getPanelWidthRange } from '../panels/panelResize';
import { startNativeWindowResize } from '../services/NativeWindowResize';
import { getDockBounds, getTargetDisplay } from '../utils/display';
import {
  type WindowBounds,
  getPanelBounds,
  percentToPanelPx
} from '../utils/panelBounds';

const getPanelBackgroundColor = (config: AppConfig): string => {
  const surface = resolveSurfaceColors(config.appearance, true);
  const { r, g, b } = parseHex8(surface.bg);
  const hex = (value: number): string => value.toString(16).padStart(2, '0');
  return `#${hex(r)}${hex(g)}${hex(b)}`;
};

export class PanelWindow {
  private window: BrowserWindow | null = null;
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
    if (this.window && !this.window.isDestroyed()) {
      this.window.setBackgroundColor(getPanelBackgroundColor(config));
    }
  }

  create(): BrowserWindow {
    const dockBounds = getDockBounds(
      this.config.layout.edge,
      this.config.layout.displayId
    );
    const display = getTargetDisplay(this.config.layout.displayId);
    const maxWidthPercent =
      this.config.layout.panelDefaultWidth >= 25 &&
      this.config.layout.panelDefaultWidth <= 100
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
      transparent: false,
      show: false,
      hasShadow: false,
      thickFrame: true,
      roundedCorners: false,
      type: 'toolbar',
      skipTaskbar: true,
      backgroundColor: getPanelBackgroundColor(this.config),
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/panel.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false
      }
    });

    this.window.setIgnoreMouseEvents(true, { forward: true });
    this.window.setAlwaysOnTop(true, 'floating');
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    if (process.env.ELECTRON_RENDERER_URL) {
      void this.window.loadURL(
        `${process.env.ELECTRON_RENDERER_URL}/panel-chrome/index.html`
      );
    } else {
      void this.window.loadFile(
        join(__dirname, '../renderer/panel-chrome/index.html')
      );
    }

    return this.window;
  }

  getBrowserWindow(): BrowserWindow | null {
    return this.window;
  }

  hide(): void {
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

  rememberNativeWidth(
    edge: AppConfig['layout']['edge'],
    panelWidth: number
  ): void {
    this.lastEdge = edge;
    this.lastPanelWidth = panelWidth;
  }

  startNativeResize(
    edge: AppConfig['layout']['edge'],
    point: Electron.Point
  ): boolean {
    if (!this.window || this.window.isDestroyed()) return false;
    const resizeEdge = edge === 'right' ? 'left' : 'right';
    const bounds = this.window.getBounds();
    const edgeX = resizeEdge === 'left' ? bounds.x : bounds.x + bounds.width;
    const edgePoint = screen.dipToScreenPoint({ x: edgeX, y: point.y });
    return startNativeWindowResize(
      this.window.getNativeWindowHandle(),
      resizeEdge,
      edgePoint
    );
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
    const dockBounds = getDockBounds(
      this.lastEdge,
      this.config.layout.displayId
    );
    const nextBounds = getPanelBounds(
      this.lastEdge,
      dockBounds,
      this.lastPanelWidth
    );
    const currentBounds = this.window.getBounds();
    if (
      currentBounds.x === nextBounds.x &&
      currentBounds.y === nextBounds.y &&
      currentBounds.width === nextBounds.width &&
      currentBounds.height === nextBounds.height
    ) {
      return;
    }
    this.window.setBounds(nextBounds);
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }
}
