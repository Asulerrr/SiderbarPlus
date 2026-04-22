import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { DOCK_WIDTH } from '../../shared/constants';
import type { AppConfig } from '../../shared/types';
import { getDockBounds } from '../utils/display';

export class PanelWindow {
  private window: BrowserWindow | null = null;

  constructor(private readonly config: AppConfig) {}

  create(): BrowserWindow {
    const dockBounds = getDockBounds(this.config.layout.edge);
    const x =
      this.config.layout.edge === 'right'
        ? dockBounds.x - this.config.layout.panelDefaultWidth
        : dockBounds.x + DOCK_WIDTH;

    this.window = new BrowserWindow({
      x,
      y: dockBounds.y,
      width: this.config.layout.panelDefaultWidth,
      height: dockBounds.height,
      minWidth: this.config.layout.panelDefaultWidth,
      minHeight: 480,
      frame: false,
      transparent: true,
      show: false,
      hasShadow: false,
      thickFrame: false,
      roundedCorners: false,
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
    this.window.setAlwaysOnTop(true, 'screen-saver');
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
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
    this.window?.hide();
  }

  show(): void {
    this.window?.setAlwaysOnTop(true, 'screen-saver');
    this.window?.moveTop();
    this.window?.showInactive();
  }

  getContentBounds(): Electron.Rectangle | null {
    return this.window?.getContentBounds() ?? null;
  }
}
