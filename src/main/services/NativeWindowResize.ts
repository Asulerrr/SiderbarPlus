import koffi from 'koffi';
import { logger } from '../utils/logger';

const WM_NCLBUTTONDOWN = 0x00a1;
const HTLEFT = 10;
const HTRIGHT = 11;

interface ScreenPoint {
  x: number;
  y: number;
}

interface User32Bindings {
  setCursorPos: (x: number, y: number) => number;
  releaseCapture: () => number;
  postMessage: (hwnd: bigint, message: number, wParam: number, lParam: bigint) => number;
}

const loadUser32 = (): User32Bindings | null => {
  if (process.platform !== 'win32') return null;
  try {
    const lib = koffi.load('user32.dll');
    return {
      setCursorPos: lib.func('int __stdcall SetCursorPos(int x, int y)') as never,
      releaseCapture: lib.func('int __stdcall ReleaseCapture()') as never,
      postMessage: lib.func(
        'int __stdcall PostMessageW(uintptr_t hwnd, uint32 message, uintptr_t wParam, intptr_t lParam)'
      ) as never
    };
  } catch (error) {
    logger.error('Failed to load native window resize bindings', error);
    return null;
  }
};

const user32 = loadUser32();

const handleBufferToBigInt = (buffer: Buffer): bigint =>
  buffer.length >= 8 ? buffer.readBigUInt64LE(0) : BigInt(buffer.readUInt32LE(0));

const packPoint = (point: ScreenPoint): bigint =>
  BigInt(point.x & 0xffff) | (BigInt(point.y & 0xffff) << 16n);

export const startNativeWindowResize = (
  nativeHandle: Buffer,
  edge: 'left' | 'right',
  edgePoint: ScreenPoint
): boolean => {
  if (!user32) return false;
  user32.setCursorPos(edgePoint.x, edgePoint.y);
  user32.releaseCapture();
  return Boolean(
    user32.postMessage(
      handleBufferToBigInt(nativeHandle),
      WM_NCLBUTTONDOWN,
      edge === 'left' ? HTLEFT : HTRIGHT,
      packPoint(edgePoint)
    )
  );
};
