import { screen } from 'electron';
import koffi from 'koffi';
import { logger } from '../utils/logger';

/**
 * PRD §5.9.4 全屏应用检测
 *
 * - 每 500ms 调 Win32 GetForegroundWindow + GetWindowRect 与显示器尺寸比对
 * - 前台窗口覆盖整个显示器（含任务栏区域）→ 判定为全屏
 * - 排除自身窗口 hwnd（来自 BrowserWindow.getNativeWindowHandle()）
 *
 * 仅 Windows，其他平台 start() 空操作。
 */

const POLL_INTERVAL_MS = 500;

const RECT = koffi.struct('RECT', {
  left: 'long',
  top: 'long',
  right: 'long',
  bottom: 'long'
});

type Rect = { left: number; top: number; right: number; bottom: number };

interface User32 {
  GetForegroundWindow: () => unknown; // 返回 HWND 指针
  GetWindowRect: (hwnd: unknown, rect: Rect) => number;
  GetClassNameA: (hwnd: unknown, buf: Buffer, max: number) => number;
}

const loadUser32 = (): User32 | null => {
  if (process.platform !== 'win32') {
    return null;
  }
  try {
    const lib = koffi.load('user32.dll');
    return {
      GetForegroundWindow: lib.func('void *GetForegroundWindow()') as never,
      GetWindowRect: lib.func('int __stdcall GetWindowRect(void *hwnd, _Out_ RECT *rect)') as never,
      GetClassNameA: lib.func(
        'int __stdcall GetClassNameA(void *hwnd, char *lpClassName, int nMaxCount)'
      ) as never
    };
  } catch (error) {
    logger.error('FullscreenWatcher failed to load user32.dll', error);
    return null;
  }
};

// Windows 桌面 / 任务栏壳窗口的类名。它们的 bounds 覆盖整屏，会被简单的
// "前台窗口 == 显示器 bounds" 判断误判为全屏 → 触发 dock 隐藏。
// 用户点击桌面、最小化所有窗口、Win+D 都会让这些壳窗口成为前台。
const SHELL_WINDOW_CLASSES = new Set([
  'Progman',
  'WorkerW',
  'Shell_TrayWnd',
  'Shell_SecondaryTrayWnd',
  'ScreenClippingHost',
  'SnippingToolHost',
  'SnippingTool'
]);

const ENTER_FULLSCREEN_CHECKS = 10;
const EXIT_FULLSCREEN_CHECKS = 2;

const readClassName = (user32: User32, hwnd: unknown): string | null => {
  try {
    const buf = Buffer.alloc(256);
    const len = user32.GetClassNameA(hwnd, buf, buf.length);
    if (len <= 0) return null;
    return buf.subarray(0, len).toString('ascii');
  } catch {
    return null;
  }
};

const hwndToBigInt = (ptr: unknown): bigint => {
  const addr = koffi.address(ptr as never);
  return typeof addr === 'bigint' ? addr : BigInt(addr as number);
};

const handleBufferToBigInt = (buf: Buffer): bigint => {
  // BrowserWindow.getNativeWindowHandle() 在 Win64 上返回 8 字节 LE
  if (buf.length >= 8) {
    return buf.readBigUInt64LE(0);
  }
  // 32 位回退
  return BigInt(buf.readUInt32LE(0));
};

export class FullscreenWatcher {
  private timer: NodeJS.Timeout | null = null;
  private user32: User32 | null = null;
  private excludedHandles = new Set<bigint>();
  private isFullscreenActive = false;
  private fullscreenCount = 0;
  private nonFullscreenCount = 0;

  constructor(
    private readonly onEnterFullscreen: () => void,
    private readonly onExitFullscreen: () => void
  ) {
    this.user32 = loadUser32();
  }

  excludeWindow(handleBuffer: Buffer): void {
    this.excludedHandles.add(handleBufferToBigInt(handleBuffer));
  }

  start(): void {
    if (!this.user32 || this.timer) {
      return;
    }
    this.timer = setInterval(() => this.check(), POLL_INTERVAL_MS);
    logger.info('FullscreenWatcher started');
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
      logger.info('FullscreenWatcher stopped');
    }
    if (this.isFullscreenActive) {
      // 关闭检测时若处于"已隐藏"状态，主动恢复 Dock，避免用户关掉检测后 Dock 永远不显
      this.isFullscreenActive = false;
      this.onExitFullscreen();
    }
  }

  private check(): void {
    if (!this.user32) return;
    try {
      const hwndPtr = this.user32.GetForegroundWindow();
      if (!hwndPtr) return;

      const hwndKey = hwndToBigInt(hwndPtr);
      if (this.excludedHandles.has(hwndKey)) {
        if (this.isFullscreenActive) {
          this.isFullscreenActive = false;
          this.onExitFullscreen();
        }
        return;
      }

      // 排除 Windows 桌面 / 任务栏壳窗口：它们 bounds 等于整屏，会被误判为全屏。
      // 用户点击桌面、Win+D、显示桌面按钮都会让壳窗口成为前台。
      const className = readClassName(this.user32, hwndPtr);
      if (className && SHELL_WINDOW_CLASSES.has(className)) {
        if (this.isFullscreenActive) {
          this.isFullscreenActive = false;
          this.onExitFullscreen();
        }
        return;
      }

      const rect: Rect = { left: 0, top: 0, right: 0, bottom: 0 };
      if (!this.user32.GetWindowRect(hwndPtr, rect)) return;

      const winBounds = {
        x: rect.left,
        y: rect.top,
        width: rect.right - rect.left,
        height: rect.bottom - rect.top
      };

      // 与该窗口所在显示器的完整 bounds（含任务栏）比对
      const display = screen.getDisplayMatching(winBounds);
      const isFullscreen =
        winBounds.x <= display.bounds.x &&
        winBounds.y <= display.bounds.y &&
        winBounds.x + winBounds.width >= display.bounds.x + display.bounds.width &&
        winBounds.y + winBounds.height >= display.bounds.y + display.bounds.height;

      if (isFullscreen) {
        this.nonFullscreenCount = 0;
        this.fullscreenCount += 1;
        if (!this.isFullscreenActive && this.fullscreenCount >= ENTER_FULLSCREEN_CHECKS) {
          this.isFullscreenActive = true;
          this.onEnterFullscreen();
        }
      } else {
        this.fullscreenCount = 0;
        this.nonFullscreenCount += 1;
        if (this.isFullscreenActive && this.nonFullscreenCount >= EXIT_FULLSCREEN_CHECKS) {
          this.isFullscreenActive = false;
          this.onExitFullscreen();
        }
      }
    } catch (error) {
      logger.error('FullscreenWatcher.check failed', error);
    }
  }
}
