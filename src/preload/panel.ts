import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type PanelAPI } from '../shared/ipc-contracts';

const panelAPI: PanelAPI = {
  readConfig: () => ipcRenderer.invoke(IPC_CHANNELS.configRead)
};

contextBridge.exposeInMainWorld('panelAPI', panelAPI);
