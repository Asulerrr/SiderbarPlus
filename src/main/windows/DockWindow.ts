import { BrowserWindow } from 'electron';
import { join } from 'node:path';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { AppConfig } from '../../shared/types';
import { logger } from '../utils/logger';
import { getDockBounds } from '../utils/display';

export class DockWindow {
  private window: BrowserWindow | null = null;
  private visible = false;

  constructor(private config: AppConfig) {}

  updateConfig(config: AppConfig): void {
    this.config = config;
  }

  create(): BrowserWindow {
    const bounds = getDockBounds(this.config.layout.edge, this.config.layout.displayId);

    this.window = new BrowserWindow({
      ...bounds,
      frame: false,
      transparent: true,
      hasShadow: false,
      thickFrame: false,
      roundedCorners: false,
      resizable: false,
      movable: false,
      fullscreenable: false,
      maximizable: false,
      minimizable: false,
      show: false,
      type: 'toolbar',
      skipTaskbar: true,
      backgroundColor: '#00000000',
      autoHideMenuBar: true,
      webPreferences: {
        preload: join(__dirname, '../preload/dock.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false
      }
    });

    this.window.setAlwaysOnTop(true, 'floating');
    this.window.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

    // ready-to-show 可能在 AppBar 注册（收缩 work area）之后才触发。
    // showInactive 时 Windows 可能校验窗口是否在 work area 内并 snap 回去，
    // 因此显示后强制 setBounds 把 dock 钉回屏边。
    this.window.once('ready-to-show', () => {
      this.window?.showInactive();
      this.window?.setIgnoreMouseEvents(!this.visible);
      this.window?.setOpacity(this.visible ? 1 : 0);
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
    this.visible = true;
    this.window.setAlwaysOnTop(true, 'floating');
    this.window.setIgnoreMouseEvents(false);
    this.window.moveTop();
    this.assertPosition();
    this.window.setOpacity(1);
    this.window.webContents.send(IPC_CHANNELS.dockWillShow);
  }

  hide(): void {
    if (!this.window) return;
    this.visible = false;
    this.window.setOpacity(0);
    this.window.setIgnoreMouseEvents(true);
  }

  isVisible(): boolean {
    return this.visible;
  }

  updateBounds(edge: AppConfig['layout']['edge'], displayId?: number): void {
    if (!this.window) return;
    this.window.setBounds(getDockBounds(edge, displayId));
  }

  /** opacity=0 → 重定位（OS 动画在透明期间完成）→ opacity=1 + CSS 滑入 */
  reposition(edge: AppConfig['layout']['edge'], displayId?: number): void {
    if (!this.window) return;
    // 1. 透明隐藏（不用 BrowserWindow.hide()，避免 SW_HIDE 导致 showInactive 后状态异常）
    this.window.setOpacity(0);
    this.window.setIgnoreMouseEvents(true);
    // 2. 重定位——OS 可能动画窗口位移，但 opacity=0 看不见
    this.window.setBounds(getDockBounds(edge, displayId));
    // 3. 延迟显示：等 OS 位移动画完成（Windows DWM ~150ms）
    setTimeout(() => {
      if (!this.window || this.window.isDestroyed()) return;
      this.visible = true;
      this.window.setAlwaysOnTop(true, 'floating');
      this.window.setIgnoreMouseEvents(false);
      this.window.setOpacity(1);
      this.window.webContents.send(IPC_CHANNELS.dockWillShow);
    }, 200);
  }

  /** 强制把 dock 窗口钉回屏边（work area 收缩后 Windows 可能把它 snap 进去） */
  private assertPosition(): void {
    if (!this.window || this.window.isDestroyed()) return;
    const bounds = getDockBounds(this.config.layout.edge, this.config.layout.displayId);
    this.window.setBounds(bounds);
  }
}
