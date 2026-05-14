import { BrowserWindow } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { PanelState } from '../../shared/types';

export const emitPanelState = (state: PanelState): void => {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.getTitle() === 'SideBar Panel Animation') continue;
    window.webContents.send(IPC_CHANNELS.panelState, state);
  }
};
