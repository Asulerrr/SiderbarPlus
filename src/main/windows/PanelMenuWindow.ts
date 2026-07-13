import { BrowserWindow, ipcMain, screen } from 'electron';
import { join } from 'node:path';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import {
  getPanelMenuWindowSize,
  PANEL_MENU_ITEM_COUNT,
  PANEL_MENU_SEPARATOR_COUNT
} from '../../shared/menuLayout';
import type { PanelMenuOpenPayload } from '../../shared/types';
import { isLeftMouseButtonDown } from '../services/NativeWindowResize';

const MENU_SIZE = getPanelMenuWindowSize({
  itemCount: PANEL_MENU_ITEM_COUNT,
  separatorCount: PANEL_MENU_SEPARATOR_COUNT
});
const MENU_RENDER_TIMEOUT_MS = 250;
const OUTSIDE_CLICK_POLL_MS = 16;

export class PanelMenuWindow {
  private window: BrowserWindow | null = null;
  private pendingPayload: PanelMenuOpenPayload | null = null;
  private ready = false;
  private nextRenderId = 0;
  private pendingRenderId: number | null = null;
  private renderFallbackTimer: NodeJS.Timeout | null = null;
  private outsideClickTracker: NodeJS.Timeout | null = null;
  private leftMouseButtonWasDown = false;

  private readonly handleHydrated = (
    event: Electron.IpcMainEvent,
    renderId: number
  ): void => {
    if (event.sender !== this.window?.webContents) return;
    this.presentHydratedMenu(renderId);
  };

  constructor(private readonly onDismiss: () => void = () => undefined) {}

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
        sandbox: false,
        backgroundThrottling: false
      }
    });

    ipcMain.on(IPC_CHANNELS.panelMenuHydrated, this.handleHydrated);
    this.window.setAlwaysOnTop(true, 'floating');
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.window.on('blur', () => {
      if (this.window?.isVisible()) this.dismiss();
    });
    this.window.webContents.once('did-finish-load', () => {
      this.ready = true;
      if (this.pendingPayload) {
        this.showWithPayload(this.pendingPayload);
        this.pendingPayload = null;
      }
    });
    this.window.once('closed', () => {
      ipcMain.removeListener(IPC_CHANNELS.panelMenuHydrated, this.handleHydrated);
      this.cancelPendingPresentation();
      this.stopOutsideClickTracking();
      this.ready = false;
      this.window = null;
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

    this.cancelPendingPresentation();
    this.stopOutsideClickTracking();
    this.window.hide();
    this.window.setBounds({
      x: Math.round(x),
      y: Math.round(y),
      width: MENU_SIZE.width,
      height: MENU_SIZE.height
    });
    this.window.setAlwaysOnTop(true, 'floating');
    const renderId = ++this.nextRenderId;
    this.pendingRenderId = renderId;
    this.window.webContents.send(IPC_CHANNELS.panelMenuHydrate, {
      ...payload,
      renderId
    });
    this.renderFallbackTimer = setTimeout(() => {
      this.presentHydratedMenu(renderId);
    }, MENU_RENDER_TIMEOUT_MS);
    this.renderFallbackTimer.unref();
  }

  hide(): void {
    this.pendingPayload = null;
    this.cancelPendingPresentation();
    this.stopOutsideClickTracking();
    this.window?.hide();
  }

  private presentHydratedMenu(renderId: number): void {
    if (
      !this.window ||
      this.window.isDestroyed() ||
      renderId !== this.pendingRenderId
    ) {
      return;
    }

    this.pendingRenderId = null;
    this.clearRenderFallbackTimer();
    this.window.moveTop();
    this.window.showInactive();
    this.startOutsideClickTracking();
  }

  private cancelPendingPresentation(): void {
    this.pendingRenderId = null;
    this.clearRenderFallbackTimer();
  }

  private clearRenderFallbackTimer(): void {
    if (!this.renderFallbackTimer) return;
    clearTimeout(this.renderFallbackTimer);
    this.renderFallbackTimer = null;
  }

  private startOutsideClickTracking(): void {
    this.stopOutsideClickTracking();
    this.leftMouseButtonWasDown = isLeftMouseButtonDown();
    this.outsideClickTracker = setInterval(() => {
      const isButtonDown = isLeftMouseButtonDown();
      if (isButtonDown && !this.leftMouseButtonWasDown) {
        const cursor = screen.getCursorScreenPoint();
        const bounds = this.window?.getBounds();
        const isInside =
          bounds &&
          cursor.x >= bounds.x &&
          cursor.x <= bounds.x + bounds.width &&
          cursor.y >= bounds.y &&
          cursor.y <= bounds.y + bounds.height;
        if (!isInside) {
          this.dismiss();
          return;
        }
      }
      this.leftMouseButtonWasDown = isButtonDown;
    }, OUTSIDE_CLICK_POLL_MS);
    this.outsideClickTracker.unref();
  }

  private stopOutsideClickTracking(): void {
    if (!this.outsideClickTracker) return;
    clearInterval(this.outsideClickTracker);
    this.outsideClickTracker = null;
    this.leftMouseButtonWasDown = false;
  }

  private dismiss(): void {
    this.hide();
    this.onDismiss();
  }
}
