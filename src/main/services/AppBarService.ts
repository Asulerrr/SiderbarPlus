import koffi from 'koffi';
import { logger } from '../utils/logger';

/**
 * Windows AppBar 占位服务（基于 Shell API SHAppBarMessage）。
 *
 * 支持多个 AppBar 同时注册（dock + pinned panel），
 * Windows 自动在同一边堆叠多个 AppBar 并正确处理 work area。
 *
 * 全屏（视频/游戏）窗口不受影响（系统原生行为）。
 */

const ABE_LEFT = 0;
const ABE_RIGHT = 2;

const ABM_NEW = 0x00000000;
const ABM_REMOVE = 0x00000001;
const ABM_QUERYPOS = 0x00000002;
const ABM_SETPOS = 0x00000003;

interface RectFields {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

interface AppBarData {
  cbSize: number;
  hWnd: bigint;
  uCallbackMessage: number;
  uEdge: number;
  rc: RectFields;
  lParam: bigint;
}

interface Shell32Bindings {
  SHAppBarMessage: (msg: number, data: AppBarData) => bigint | number;
  appBarDataSize: number;
}

interface AppBarEntry {
  hwnd: bigint;
  edge: 'left' | 'right';
}

const loadShell32 = (): Shell32Bindings | null => {
  if (process.platform !== 'win32') {
    return null;
  }
  try {
    const RECT = koffi.struct('AppBarRect', {
      left: 'long',
      top: 'long',
      right: 'long',
      bottom: 'long'
    });
    const APPBARDATA = koffi.struct('APPBARDATA', {
      cbSize: 'uint32',
      hWnd: 'uintptr_t',
      uCallbackMessage: 'uint32',
      uEdge: 'uint32',
      rc: RECT,
      lParam: 'intptr_t'
    });
    const lib = koffi.load('shell32.dll');
    const SHAppBarMessage = lib.func(
      'uintptr_t __stdcall SHAppBarMessage(uint32 dwMessage, APPBARDATA *pData)'
    );
    return {
      SHAppBarMessage: SHAppBarMessage as never,
      appBarDataSize: koffi.sizeof(APPBARDATA)
    };
  } catch (error) {
    logger.error('AppBarService failed to load shell32.dll', error);
    return null;
  }
};

const handleBufferToBigInt = (buf: Buffer): bigint => {
  if (buf.length >= 8) return buf.readBigUInt64LE(0);
  return BigInt(buf.readUInt32LE(0));
};

export interface PhysicalRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class AppBarService {
  private readonly bindings: Shell32Bindings | null;
  private readonly entries = new Map<string, AppBarEntry>();

  constructor() {
    this.bindings = loadShell32();
  }

  isAvailable(): boolean {
    return this.bindings !== null;
  }

  /**
   * 注册一个 AppBar。同一 id 重复调用则走 setPos 更新。
   * 返回系统批准后的物理像素 rect。
   */
  register(
    id: string,
    handleBuffer: Buffer,
    edge: 'left' | 'right',
    physicalRect: PhysicalRect
  ): PhysicalRect | null {
    if (!this.bindings) return null;
    const hwnd = handleBufferToBigInt(handleBuffer);

    const existing = this.entries.get(id);
    if (existing) {
      if (existing.hwnd === hwnd) {
        return this.setPos(id, edge, physicalRect);
      }
      this.remove(id);
    }

    const data: AppBarData = {
      cbSize: this.bindings.appBarDataSize,
      hWnd: hwnd,
      uCallbackMessage: 0,
      uEdge: this.toEdgeCode(edge),
      rc: this.toRect(physicalRect),
      lParam: 0n
    };
    const result = this.bindings.SHAppBarMessage(ABM_NEW, data);
    if (!result) {
      logger.warn('AppBar ABM_NEW failed', { id });
      return null;
    }
    this.entries.set(id, { hwnd, edge });

    return this.setPos(id, edge, physicalRect);
  }

  /** 更新已注册 AppBar 的占位区域。返回系统批准的物理 rect。 */
  setPos(id: string, edge: 'left' | 'right', physicalRect: PhysicalRect): PhysicalRect | null {
    if (!this.bindings) return null;
    const entry = this.entries.get(id);
    if (!entry) return null;

    const queryData: AppBarData = {
      cbSize: this.bindings.appBarDataSize,
      hWnd: entry.hwnd,
      uCallbackMessage: 0,
      uEdge: this.toEdgeCode(edge),
      rc: this.toRect(physicalRect),
      lParam: 0n
    };
    this.bindings.SHAppBarMessage(ABM_QUERYPOS, queryData);

    const setData: AppBarData = {
      cbSize: this.bindings.appBarDataSize,
      hWnd: entry.hwnd,
      uCallbackMessage: 0,
      uEdge: this.toEdgeCode(edge),
      rc: queryData.rc,
      lParam: 0n
    };
    const result = this.bindings.SHAppBarMessage(ABM_SETPOS, setData);
    if (!result) {
      logger.warn('AppBar ABM_SETPOS failed', { id, edge, physicalRect });
      return null;
    }

    entry.edge = edge;
    return {
      x: setData.rc.left,
      y: setData.rc.top,
      width: setData.rc.right - setData.rc.left,
      height: setData.rc.bottom - setData.rc.top
    };
  }

  /** 注销一个 AppBar */
  remove(id: string): void {
    if (!this.bindings) return;
    const entry = this.entries.get(id);
    if (!entry) return;

    const data: AppBarData = {
      cbSize: this.bindings.appBarDataSize,
      hWnd: entry.hwnd,
      uCallbackMessage: 0,
      uEdge: this.toEdgeCode(entry.edge),
      rc: { left: 0, top: 0, right: 0, bottom: 0 },
      lParam: 0n
    };
    const result = this.bindings.SHAppBarMessage(ABM_REMOVE, data);
    if (result) {
      logger.info('AppBar removed', { id });
    } else {
      logger.warn('AppBar ABM_REMOVE failed', { id, edge: entry.edge });
    }
    this.entries.delete(id);
  }

  /** 注销所有 AppBar */
  removeAll(): void {
    for (const id of [...this.entries.keys()]) {
      this.remove(id);
    }
  }

  isRegistered(id: string): boolean {
    return this.entries.has(id);
  }

  private toEdgeCode(edge: 'left' | 'right'): number {
    return edge === 'left' ? ABE_LEFT : ABE_RIGHT;
  }

  private toRect(r: PhysicalRect): RectFields {
    return {
      left: Math.round(r.x),
      top: Math.round(r.y),
      right: Math.round(r.x + r.width),
      bottom: Math.round(r.y + r.height)
    };
  }
}
