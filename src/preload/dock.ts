import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type DockAPI } from '../shared/ipc-contracts';

const dockAPI: DockAPI = {
  readConfig: () => ipcRenderer.invoke(IPC_CHANNELS.configRead),
  updateConfig: (patch) => ipcRenderer.invoke(IPC_CHANNELS.configUpdate, patch),
  listPanels: () => ipcRenderer.invoke(IPC_CHANNELS.panelsList),
  addPanel: (payload) => ipcRenderer.invoke(IPC_CHANNELS.panelsAdd, payload),
  updatePanel: (payload) => ipcRenderer.invoke(IPC_CHANNELS.panelsUpdate, payload),
  reorderPanels: (panelIds) => ipcRenderer.invoke(IPC_CHANNELS.panelsReorder, panelIds),
  hoverPanel: (id) => ipcRenderer.invoke(IPC_CHANNELS.panelsHover, { id }),
  showPanel: (id) => ipcRenderer.invoke(IPC_CHANNELS.panelsShow, { id }),
  hidePanels: () => ipcRenderer.invoke(IPC_CHANNELS.panelsHide),
  scheduleHide: () => ipcRenderer.invoke(IPC_CHANNELS.panelsScheduleHide),
  cancelHide: () => ipcRenderer.invoke(IPC_CHANNELS.panelsCancelHide),
  removePanel: (id) => ipcRenderer.invoke(IPC_CHANNELS.panelsRemove, { id }),
  openPanelContextMenu: (id) => ipcRenderer.invoke(IPC_CHANNELS.panelsContextMenu, { id }),
  hideToTray: () => ipcRenderer.invoke(IPC_CHANNELS.appHideToTray),
  toggleDockVisibility: () => ipcRenderer.invoke(IPC_CHANNELS.appToggleDockVisibility),
  openQuickMenu: () => ipcRenderer.invoke(IPC_CHANNELS.appOpenQuickMenu),
  onWillShow: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(IPC_CHANNELS.dockWillShow, listener);
    return () => { ipcRenderer.removeListener(IPC_CHANNELS.dockWillShow, listener); };
  },
  onPanelState: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, state: Parameters<typeof callback>[0]) => {
      callback(state);
    };

    ipcRenderer.on(IPC_CHANNELS.panelState, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.panelState, listener);
    };
  },
  onPanelsUpdated: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: Parameters<typeof callback>[0]) => {
      callback(payload);
    };

    ipcRenderer.on(IPC_CHANNELS.panelsUpdated, listener);

    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.panelsUpdated, listener);
    };
  },
  onConfigChanged: (callback) => {
    const listener = (_event: Electron.IpcRendererEvent, config: Parameters<typeof callback>[0]) => {
      callback(config);
    };
    ipcRenderer.on(IPC_CHANNELS.configChanged, listener);
    return () => {
      ipcRenderer.removeListener(IPC_CHANNELS.configChanged, listener);
    };
  }
};

contextBridge.exposeInMainWorld('dockAPI', dockAPI);
