import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type PanelMenuAPI } from '../shared/ipc-contracts';

const panelMenuAPI: PanelMenuAPI = {
  runMenuAction: (payload) => ipcRenderer.invoke(IPC_CHANNELS.panelsMenuAction, payload),
  closeMenu: () => ipcRenderer.invoke(IPC_CHANNELS.panelsMenuClose),
  onHydrate: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: Parameters<typeof callback>[0]
    ) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.panelMenuHydrate, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.panelMenuHydrate, listener);
  }
};

contextBridge.exposeInMainWorld('panelMenuAPI', panelMenuAPI);
