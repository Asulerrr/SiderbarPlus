import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { DOCK_BACKGROUND } from '../../shared/constants';
import type { AppConfig } from '../../shared/types';
import { logger } from '../utils/logger';
import { getDockBounds } from '../utils/display';

export class DockWindow {
  private window: BrowserWindow | null = null;

  constructor(private config: AppConfig) {}

  updateConfig(config: AppConfig): void {
    this.config = config;
  }

  create(): BrowserWindow {
    const bounds = getDockBounds(this.config.layout.edge, this.config.layout.displayId);

    this.window = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: false,
      hasShadow: false,
      thickFrame: false,
      roundedCorners: false,
      resizable: false,
      movable: false,
      fullscreenable: false,
      maximizable: false,
      minimizable: false,
      show: false,
      skipTaskbar: true,
      backgroundColor: DOCK_BACKGROUND,
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/dock.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    this.window.setAlwaysOnTop(true, 'screen-saver');
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // ready-to-show 可能在 AppBar 注册（收缩 work area）之后才触发。
    // showInactive 时 Windows 可能校验窗口是否在 work area 内并 snap 回去，
    // 因此显示后强制 setBounds 把 dock 钉回屏边。
    this.window.once('ready-to-show', () => {
      this.window?.showInactive();
      this.assertPosition();
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
    this.window.setAlwaysOnTop(true, 'screen-saver');
    this.window.moveTop();
    this.assertPosition();
    this.window.showInactive();
  }

  hide(): void {
    this.window?.hide();
  }

  isVisible(): boolean {
    return this.window?.isVisible() ?? false;
  }

  updateBounds(edge: AppConfig['layout']['edge'], displayId?: number): void {
    if (!this.window) return;
    this.window.setBounds(getDockBounds(edge, displayId));
  }

  /** 强制把 dock 窗口钉回屏边（work area 收缩后 Windows 可能把它 snap 进去） */
  private assertPosition(): void {
    if (!this.window || this.window.isDestroyed()) return;
    const bounds = getDockBounds(this.config.layout.edge, this.config.layout.displayId);
    this.window.setBounds(bounds);
  }
}
