import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { AppConfig } from '../../shared/types';
import { getDockBounds } from '../utils/display';
import { getPanelBounds } from '../utils/panelBounds';

export class PanelWindow {
  private window: BrowserWindow | null = null;

  constructor(private readonly config: AppConfig) {}

  create(): BrowserWindow {
    const dockBounds = getDockBounds(this.config.layout.edge);
    const panelBounds = getPanelBounds(
      this.config.layout.edge,
      dockBounds,
      this.config.layout.panelDefaultWidth
    );

    this.window = new BrowserWindow({
      ...panelBounds,
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

  updateBounds(edge: AppConfig['layout']['edge'], panelWidth: number): void {
    if (!this.window) {
      return;
    }

    const dockBounds = getDockBounds(edge);
    this.window.setBounds(getPanelBounds(edge, dockBounds, panelWidth));
  }
}
