import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type BuiltinAPI } from '../shared/ipc-contracts';

const builtinAPI: BuiltinAPI = {
  readConfig: () => ipcRenderer.invoke(IPC_CHANNELS.configRead)
};

contextBridge.exposeInMainWorld('builtinAPI', builtinAPI);
