import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { AppConfig } from '../../shared/types';
import { logger } from '../utils/logger';
import { getDockBounds } from '../utils/display';

export class DockWindow {
  private window: BrowserWindow | null = null;
  private visible = false;
  private ready = false;
  private geometryGeneration = 0;
  private activeGeometryGeneration: number | null = null;

  constructor(private config: AppConfig) {}

  updateConfig(config: AppConfig): void {
    this.config = config;
  }

  create(): BrowserWindow {
    const bounds = getDockBounds(this.config.layout.edge, this.config.layout.displayId);

    this.window = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      hasShadow: false,
      thickFrame: false,
      roundedCorners: false,
      resizable: false,
      movable: false,
      fullscreenable: false,
      maximizable: false,
      minimizable: false,
      show: false,
      type: 'toolbar',
      skipTaskbar: true,
      backgroundColor: '#00000000',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/dock.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    this.window.setAlwaysOnTop(true, 'floating');
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    this.window.once('ready-to-show', () => {
      this.ready = true;
      this.window?.showInactive();
      if (this.activeGeometryGeneration !== null || !this.visible) {
        this.window?.setIgnoreMouseEvents(true);
        this.window?.setOpacity(0);
        return;
      }
      this.present(false);
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      void this.window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/dock/index.html`);
    } else {
      void this.window.loadFile(join(__dirname, '../renderer/dock/index.html'));
    }

    logger.info('DockWindow created', bounds);

    return this.window;
  }

  getBrowserWindow(): BrowserWindow | null {
    return this.window;
  }

  show(): void {
    if (!this.window) return;
    this.visible = true;
    if (this.activeGeometryGeneration !== null) return;
    this.present(true);
  }

  hide(): void {
    if (!this.window) return;
    this.visible = false;
    this.window.setOpacity(0);
    this.window.setIgnoreMouseEvents(true);
  }

  isVisible(): boolean {
    return this.visible;
  }

  updateBounds(edge: AppConfig['layout']['edge'], displayId?: number): void {
    if (!this.window) return;
    this.window.setBounds(getDockBounds(edge, displayId));
  }

  isAtBounds(edge: AppConfig['layout']['edge'], displayId?: number): boolean {
    if (!this.window || this.window.isDestroyed()) return false;
    const current = this.window.getBounds();
    const expected = getDockBounds(edge, displayId);
    return (
      current.x === expected.x &&
      current.y === expected.y &&
      current.width === expected.width &&
      current.height === expected.height
    );
  }

  beginGeometryTransition(): number {
    const generation = ++this.geometryGeneration;
    this.activeGeometryGeneration = generation;
    if (!this.window || this.window.isDestroyed()) return generation;
    this.window.setOpacity(0);
    this.window.setIgnoreMouseEvents(true);
    this.window.setAlwaysOnTop(false);
    return generation;
  }

  finishGeometryTransition(generation: number): boolean {
    if (generation !== this.activeGeometryGeneration) return false;
    this.activeGeometryGeneration = null;
    this.assertPosition();
    if (this.visible) {
      this.present(false);
    }
    return true;
  }

  /** 强制把 dock 窗口钉回屏边（work area 收缩后 Windows 可能把它 snap 进去） */
  private assertPosition(): void {
    if (!this.window || this.window.isDestroyed()) return;
    const bounds = getDockBounds(this.config.layout.edge, this.config.layout.displayId);
    this.window.setBounds(bounds);
  }

  private present(animate: boolean): void {
    if (!this.window || this.window.isDestroyed() || !this.ready) return;
    this.window.setAlwaysOnTop(true, 'floating');
    // Restoring TOPMOST can make Shell constrain the window to the work area.
    // The last geometry write must therefore happen after the style change.
    this.assertPosition();
    this.window.setIgnoreMouseEvents(false);
    this.window.moveTop();
    this.window.setOpacity(1);
    if (animate) {
      this.window.webContents.send(IPC_CHANNELS.dockWillShow);
    }
  }
}
