import { ipcRenderer, webFrame } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-contracts';

// Lock cursor to default — prevents flicker between arrow and hand
// as mouse moves over website content with varying cursor styles.
webFrame.insertCSS('*,*::before,*::after,a,button,input,textarea,select,[role=button],[onclick]{cursor:default!important}');

// --- Google login GIS credential relay ---
// With contextIsolation: false the main process can call this function
// via executeJavaScript. We dispatch a real MessageEvent on the window
// so ALL registered 'message' listeners receive it — no need to capture
// individual handlers (which is fragile if the page registers multiple
// listeners or if GIS initialises late).
(window as any).__googleLoginReceive = (data: unknown): void => {
  try {
    const event = new MessageEvent('message', {
      data,
      origin: 'https://accounts.google.com',
      source: window
    });
    window.dispatchEvent(event);
  } catch (e) {
    console.error('[webPanel] GIS dispatch failed:', e);
  }
};
// --- end Google login relay ---

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
