import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { PanelMenuOpenPayload } from '../../shared/types';

const MENU_WIDTH = 196;
const MENU_HEIGHT = 138;

export class PanelMenuWindow {
  private window: BrowserWindow | null = null;

  create(): BrowserWindow {
    this.window = new BrowserWindow({
      width: MENU_WIDTH,
      height: MENU_HEIGHT,
      frame: false,
      transparent: true,
      show: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      hasShadow: false,
      thickFrame: false,
      roundedCorners: false,
      backgroundColor: '#00000000',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/panelMenu.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    this.window.setAlwaysOnTop(true, 'screen-saver');
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    if (process.env.ELECTRON_RENDERER_URL) {
      void this.window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/panel-menu/index.html`);
    } else {
      void this.window.loadFile(join(__dirname, '../renderer/panel-menu/index.html'));
    }

    return this.window;
  }

  getBrowserWindow(): BrowserWindow | null {
    return this.window;
  }

  open(payload: PanelMenuOpenPayload): void {
    if (!this.window) {
      return;
    }

    const display = screen.getDisplayNearestPoint({
      x: Math.round(payload.x),
      y: Math.round(payload.y)
    });
    const { workArea } = display;
    const preferredX = payload.edge === 'right' ? payload.x - MENU_WIDTH : payload.x;
    const preferredY = payload.y;
    const x = Math.min(
      Math.max(preferredX, workArea.x),
      workArea.x + workArea.width - MENU_WIDTH
    );
    const y = Math.min(
      Math.max(preferredY, workArea.y),
      workArea.y + workArea.height - MENU_HEIGHT
    );

    this.window.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: MENU_WIDTH,
      height: MENU_HEIGHT
    });
    this.window.showInactive();
    this.window.webContents.send(IPC_CHANNELS.panelMenuHydrate, payload);
  }

  hide(): void {
    this.window?.hide();
  }
}
