import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import type { AppConfig } from '../../shared/types';

export class PanelWindow {
  private window: BrowserWindow | null = null;

  constructor(private readonly config: AppConfig) {}

  create(): BrowserWindow {
    this.window = new BrowserWindow({
      width: this.config.layout.panelDefaultWidth,
      height: 640,
      minWidth: this.config.layout.panelDefaultWidth,
      minHeight: 480,
      frame: false,
      show: false,
      skipTaskbar: true,
      backgroundColor: '#202020',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/panel.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      void this.window.loadURL(
        `${process.env.ELECTRON_RENDERER_URL}/src/renderer/panel-chrome/index.html`
      );
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
}
