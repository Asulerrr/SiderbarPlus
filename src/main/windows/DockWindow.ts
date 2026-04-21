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
    const bounds = getDockBounds(this.config.layout.edge);

    this.window = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: false,
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
      void this.window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/src/renderer/dock/index.html`);
    } else {
      void this.window.loadFile(join(__dirname, '../renderer/dock/index.html'));
    }

    logger.info('DockWindow created', bounds);

    return this.window;
  }

  getBrowserWindow(): BrowserWindow | null {
    return this.window;
  }
}
