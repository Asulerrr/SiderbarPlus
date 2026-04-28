import { BrowserWindow } from 'electron';
import { getDockBounds } from '../utils/display';
import type { AppConfig } from '../../shared/types';

/**
 * AppBar 占位用的隐藏锚点窗口。
 *
 * 把 SHAppBarMessage 注册到一个独立的隐藏 HWND 上（而不是直接注册 dockWindow），
 * 是为了避开"AppBar HWND 在系统认为它出 work area 时会被自动 snap 回去"这条规则。
 * 占位区域由 ABM_SETPOS 的 rc 参数声明，系统据此收缩 work area；锚点窗口本身
 * 在哪、是不是可见都不影响。dock 窗口因此可以保持在屏幕物理边，不被牵连。
 *
 * 锚点窗口创建在 dock 所在屏边位置（而非屏外），这样 ABM_NEW 时 Windows 看到
 * 窗口已在预期位置，不会产生额外的 rc 调整或 work area 异常。
 */
export class AppBarAnchorWindow {
  private window: BrowserWindow | null = null;

  create(edge: AppConfig['layout']['edge'], displayId?: number): BrowserWindow {
    const dockBounds = getDockBounds(edge, displayId);

    this.window = new BrowserWindow({
      x: dockBounds.x,
      y: dockBounds.y,
      width: dockBounds.width,
      height: dockBounds.height,
      show: false,
      frame: false,
      transparent: true,
      skipTaskbar: true,
      resizable: false,
      movable: false,
      focusable: false,
      hasShadow: false,
      thickFrame: false,
      roundedCorners: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true
      }
    });
    return this.window;
  }

  getBrowserWindow(): BrowserWindow | null {
    return this.window;
  }

  getNativeWindowHandle(): Buffer | null {
    return this.window?.getNativeWindowHandle() ?? null;
  }

  destroy(): void {
    if (this.window && !this.window.isDestroyed()) {
      this.window.destroy();
    }
    this.window = null;
  }
}
