import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type PanelAnimationAPI } from '../shared/ipc-contracts';

const panelAnimationAPI: PanelAnimationAPI = {
  readConfig: () => ipcRenderer.invoke(IPC_CHANNELS.configRead),
  onConfigChanged: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      config: Parameters<typeof callback>[0]
    ) => callback(config);
    ipcRenderer.on(IPC_CHANNELS.configChanged, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.configChanged, listener);
  },
  onOpen: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: Parameters<typeof callback>[0]
    ) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.panelAnimationOpen, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.panelAnimationOpen, listener);
  },
  onClose: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: Parameters<typeof callback>[0]
    ) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.panelAnimationClose, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.panelAnimationClose, listener);
  },
  onReset: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(IPC_CHANNELS.panelAnimationReset, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.panelAnimationReset, listener);
  }
};

contextBridge.exposeInMainWorld('panelAnimationAPI', panelAnimationAPI);
