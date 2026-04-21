import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type DockAPI } from '../shared/ipc-contracts';

const dockAPI: DockAPI = {
  readConfig: () => ipcRenderer.invoke(IPC_CHANNELS.configRead)
};

contextBridge.exposeInMainWorld('dockAPI', dockAPI);
