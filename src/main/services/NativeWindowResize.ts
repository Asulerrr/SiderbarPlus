import koffi from 'koffi';
import { logger } from '../utils/logger';

const WM_NCLBUTTONDOWN = 0x00a1;
const HTLEFT = 10;
const HTRIGHT = 11;
const DWMWA_NCRENDERING_POLICY = 2;
const DWMNCRP_DISABLED = 1;

interface ScreenPoint {
  x: number;
  y: number;
}

interface User32Bindings {
  setCursorPos: (x: number, y: number) => number;
  releaseCapture: () => number;
  postMessage: (hwnd: bigint, message: number, wParam: number, lParam: bigint) => number;
}

interface DwmApiBindings {
  setWindowAttribute: (
    hwnd: bigint,
    attribute: number,
    value: Buffer,
    valueSize: number
  ) => number;
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

const loadDwmApi = (): DwmApiBindings | null => {
  if (process.platform !== 'win32') return null;
  try {
    const lib = koffi.load('dwmapi.dll');
    return {
      setWindowAttribute: lib.func(
        'int __stdcall DwmSetWindowAttribute(uintptr_t hwnd, uint32 attribute, const void *value, uint32 valueSize)'
      ) as never
    };
  } catch (error) {
    logger.error('Failed to load native DWM bindings', error);
    return null;
  }
};

const dwmApi = loadDwmApi();

const handleBufferToBigInt = (buffer: Buffer): bigint =>
  buffer.length >= 8 ? buffer.readBigUInt64LE(0) : BigInt(buffer.readUInt32LE(0));

const packPoint = (point: ScreenPoint): bigint =>
  BigInt(point.x & 0xffff) | (BigInt(point.y & 0xffff) << 16n);

export const disableNativeWindowShadow = (nativeHandle: Buffer): boolean => {
  if (!dwmApi) return false;
  try {
    const policy = Buffer.alloc(4);
    policy.writeUInt32LE(DWMNCRP_DISABLED);
    const result = dwmApi.setWindowAttribute(
      handleBufferToBigInt(nativeHandle),
      DWMWA_NCRENDERING_POLICY,
      policy,
      policy.length
    );
    if (result !== 0) {
      logger.warn('Failed to disable native panel shadow', { result });
    }
    return result === 0;
  } catch (error) {
    logger.warn('Failed to disable native panel shadow', error);
    return false;
  }
};

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
