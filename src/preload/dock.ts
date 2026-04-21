import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type DockAPI } from '../shared/ipc-contracts';

const dockAPI: DockAPI = {
  readConfig: () => ipcRenderer.invoke(IPC_CHANNELS.configRead),
  updateConfig: (patch) => ipcRenderer.invoke(IPC_CHANNELS.configUpdate, patch),
  listPanels: () => ipcRenderer.invoke(IPC_CHANNELS.panelsList),
  showPanel: (id) => ipcRenderer.invoke(IPC_CHANNELS.panelsShow, { id }),
  hidePanels: () => ipcRenderer.invoke(IPC_CHANNELS.panelsHide),
  removePanel: (id) => ipcRenderer.invoke(IPC_CHANNELS.panelsRemove, { id }),
  hideToTray: () => ipcRenderer.invoke(IPC_CHANNELS.appHideToTray),
  toggleDockVisibility: () => ipcRenderer.invoke(IPC_CHANNELS.appToggleDockVisibility),
  onPanelState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof callback>[0]) => {
      callback(state);
    };

    ipcRenderer.on(IPC_CHANNELS.panelState, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.panelState, listener);
    };
  }
};

contextBridge.exposeInMainWorld('dockAPI', dockAPI);
