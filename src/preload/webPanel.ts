import { ipcRenderer, webFrame } from 'electron';
import { IPC_CHANNELS } from '../shared/ipc-contracts';

// Lock cursor to default — prevents flicker between arrow and hand
// as mouse moves over website content with varying cursor styles.
webFrame.insertCSS('*,*::before,*::after,a,button,input,textarea,select,[role=button],[onclick]{cursor:default!important}');

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
