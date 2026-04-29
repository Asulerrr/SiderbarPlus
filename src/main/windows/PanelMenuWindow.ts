import { BrowserWindow, screen } from 'electron';
import { join } from 'node:path';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import {
  getPanelMenuWindowSize,
  PANEL_MENU_ITEM_COUNT,
  PANEL_MENU_SEPARATOR_COUNT
} from '../../shared/menuLayout';
import type { PanelMenuOpenPayload } from '../../shared/types';

const MENU_SIZE = getPanelMenuWindowSize({
  itemCount: PANEL_MENU_ITEM_COUNT,
  separatorCount: PANEL_MENU_SEPARATOR_COUNT
});

export class PanelMenuWindow {
  private window: BrowserWindow | null = null;
  private pendingPayload: PanelMenuOpenPayload | null = null;
  private ready = false;

  create(): BrowserWindow {
    this.window = new BrowserWindow({
      width: MENU_SIZE.width,
      height: MENU_SIZE.height,
      frame: false,
      transparent: true,
      show: false,
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      type: 'toolbar',
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
    this.window.webContents.once('did-finish-load', () => {
      this.ready = true;
      if (this.pendingPayload) {
        this.showWithPayload(this.pendingPayload);
        this.pendingPayload = null;
      }
    });

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

    if (!this.ready) {
      this.pendingPayload = payload;
      return;
    }

    this.showWithPayload(payload);
  }

  private showWithPayload(payload: PanelMenuOpenPayload): void {
    if (!this.window) {
      return;
    }

    const display = screen.getDisplayNearestPoint({
      x: Math.round(payload.x),
      y: Math.round(payload.y)
    });
    const { workArea } = display;
    const preferredX = payload.edge === 'right' ? payload.x - MENU_SIZE.width : payload.x;
    const preferredY = payload.y;
    const x = Math.min(
      Math.max(preferredX, workArea.x),
      workArea.x + workArea.width - MENU_SIZE.width
    );
    const y = Math.min(
      Math.max(preferredY, workArea.y),
      workArea.y + workArea.height - MENU_SIZE.height
    );

    this.window.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: MENU_SIZE.width,
      height: MENU_SIZE.height
    });
    this.window.setAlwaysOnTop(true, 'screen-saver');
    this.window.moveTop();
    this.window.showInactive();
    this.window.webContents.send(IPC_CHANNELS.panelMenuHydrate, payload);
  }

  hide(): void {
    this.window?.hide();
  }
}
