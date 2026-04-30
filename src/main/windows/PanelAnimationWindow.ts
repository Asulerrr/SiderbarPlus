import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { AppConfig } from '../../shared/types';
import { getDockBounds, getTargetDisplay } from '../utils/display';
import { getPanelBounds, percentToPanelPx } from '../utils/panelBounds';

export class PanelAnimationWindow {
  private window: BrowserWindow | null = null;
  private lastPanelWidth: number;
  private lastEdge: AppConfig['layout']['edge'];

  constructor(private readonly config: AppConfig) {
    const widthPx = percentToPanelPx(
      config.layout.panelDefaultWidth,
      getTargetDisplay(config.layout.displayId).workArea.width
    );
    this.lastPanelWidth = widthPx;
    this.lastEdge = config.layout.edge;
  }

  create(): BrowserWindow {
    const dockBounds = getDockBounds(this.config.layout.edge, this.config.layout.displayId);
    const widthPx = percentToPanelPx(
      this.config.layout.panelDefaultWidth,
      getTargetDisplay(this.config.layout.displayId).workArea.width
    );
    const panelBounds = getPanelBounds(
      this.config.layout.edge,
      dockBounds,
      widthPx
    );

    this.window = new BrowserWindow({
      ...panelBounds,
      minWidth: 320,
      minHeight: 480,
      frame: false,
      transparent: true,
      show: false,
      focusable: false,
      hasShadow: false,
      thickFrame: false,
      roundedCorners: false,
      type: 'toolbar',
      skipTaskbar: true,
      backgroundColor: '#00000000',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/panelAnimation.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    this.window.setIgnoreMouseEvents(true, { forward: true });
    this.window.setAlwaysOnTop(true, 'floating');
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    this.window.once('ready-to-show', () => {
      this.window?.showInactive();
    });

    if (process.env.ELECTRON_RENDERER_URL) {
      void this.window.loadURL(`${process.env.ELECTRON_RENDERER_URL}/panel-animation/index.html`);
    } else {
      void this.window.loadFile(join(__dirname, '../renderer/panel-animation/index.html'));
    }

    return this.window;
  }

  getBrowserWindow(): BrowserWindow | null {
    return this.window;
  }

  show(): void {
    this.window?.setAlwaysOnTop(true, 'floating');
    this.window?.moveTop();
    this.assertPosition();
    this.window?.showInactive();
  }

  hide(): void {
    this.window?.webContents.send(IPC_CHANNELS.panelAnimationReset);
  }

  updateBounds(edge: AppConfig['layout']['edge'], panelWidth: number, displayId?: number): void {
    this.lastPanelWidth = panelWidth;
    this.lastEdge = edge;
    if (!this.window) return;
    const dockBounds = getDockBounds(edge, displayId);
    this.window.setBounds(getPanelBounds(edge, dockBounds, panelWidth));
  }

  /** 用最后一次 updateBounds 的参数强制重设窗口位置（work area 收缩后防 Windows snap） */
  assertPosition(): void {
    if (!this.window || this.window.isDestroyed()) return;
    const dockBounds = getDockBounds(this.lastEdge, this.config.layout.displayId);
    this.window.setBounds(getPanelBounds(this.lastEdge, dockBounds, this.lastPanelWidth));
  }
}
