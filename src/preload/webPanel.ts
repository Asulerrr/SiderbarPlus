import { ipcRenderer, webFrame } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-contracts';

// Lock cursor to default — prevents flicker between arrow and hand
// as mouse moves over website content with varying cursor styles.
webFrame.insertCSS('*,*::before,*::after,a,button,input,textarea,select,[role=button],[onclick]{cursor:default!important}');

// --- Google login GIS handler interception ---
// With contextIsolation: false, this preload and the page share the same
// window object. We override addEventListener to capture GIS's 'message'
// handler, then expose __googleLoginReceive for the main process to call
// with the credential. We construct a proper MessageEvent with
// event.source = window so GIS's security check passes (the panel's own
// window is what GIS expects as the "opener" that receives the credential).
let capturedGISHandler: ((ev: MessageEvent) => void) | null = null;

try {
  const origAddEventListener = window.addEventListener.bind(window);
  window.addEventListener = function (
    type: string,
    listener: EventListenerOrEventListenerObject | null,
    options?: boolean | AddEventListenerOptions
  ) {
    if (type === 'message' && typeof listener === 'function') {
      capturedGISHandler = listener as (ev: MessageEvent) => void;
    }
    return origAddEventListener(type, listener, options);
  } as typeof window.addEventListener;
} catch { /* */ }

(window as any).__googleLoginReceive = (data: unknown): void => {
  if (capturedGISHandler) {
    try {
      const event = new MessageEvent('message', {
        data,
        origin: 'https://accounts.google.com',
        source: window
      });
      capturedGISHandler(event);
    } catch (e) {
      console.error('[webPanel] GIS handler call failed:', e);
    }
  }
};
// --- end Google login interception ---

let lastCancelAt = 0;

const cancelHide = (): void => {
  const now = Date.now();
  if (now - lastCancelAt < 120) {
    return;
  }
  lastCancelAt = now;
  void ipcRenderer.invoke(IPC_CHANNELS.panelsCancelHide);
};

const cancelInteractionHide = (): void => {
  cancelHide();
};

const scheduleHide = (): void => {
  void ipcRenderer.invoke(IPC_CHANNELS.panelsScheduleHide);
};

window.addEventListener('mouseenter', cancelHide, true);
window.addEventListener('mousemove', cancelHide, true);
window.addEventListener('wheel', cancelHide, true);
window.addEventListener('mouseleave', scheduleHide, true);
window.addEventListener('mousedown', cancelInteractionHide, true);
window.addEventListener('keydown', cancelInteractionHide, true);
