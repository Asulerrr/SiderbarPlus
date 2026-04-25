import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { DOCK_BACKGROUND } from '../../shared/constants';
import type { AppConfig } from '../../shared/types';
import { logger } from '../utils/logger';
import { getDockBounds } from '../utils/display';

export class DockWindow {
  private window: BrowserWindow | null = null;

  constructor(private readonly config: AppConfig) {}

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
    this.window.once('ready-to-show', () => this.window?.showInactive());

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
    this.window?.showInactive();
  }

  hide(): void {
    this.window?.hide();
  }

  isVisible(): boolean {
    return this.window?.isVisible() ?? false;
  }

  updateBounds(edge: AppConfig['layout']['edge'], displayId?: number): void {
    if (!this.window) {
      return;
    }
    this.window.setBounds(getDockBounds(edge, displayId));
  }
}
