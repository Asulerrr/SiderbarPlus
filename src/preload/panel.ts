import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type PanelAPI } from '../shared/ipc-contracts';

const panelAPI: PanelAPI = {
  readConfig: () => ipcRenderer.invoke(IPC_CHANNELS.configRead),
  addPanel: (payload) => ipcRenderer.invoke(IPC_CHANNELS.panelsAdd, payload),
  listBrowsers: () => ipcRenderer.invoke(IPC_CHANNELS.browsersList),
  fetchFavicon: (payload) => ipcRenderer.invoke(IPC_CHANNELS.faviconFetch, payload),
  pickIcon: () => ipcRenderer.invoke(IPC_CHANNELS.panelsPickIcon),
  minimizePanel: () => ipcRenderer.invoke(IPC_CHANNELS.panelsMinimize),
  closePanel: () => ipcRenderer.invoke(IPC_CHANNELS.panelsClose),
  markSticky: () => ipcRenderer.invoke(IPC_CHANNELS.panelsMarkSticky),
  scheduleHide: () => ipcRenderer.invoke(IPC_CHANNELS.panelsScheduleHide),
  cancelHide: () => ipcRenderer.invoke(IPC_CHANNELS.panelsCancelHide),
  openMenu: (payload) => ipcRenderer.invoke(IPC_CHANNELS.panelsMenuOpen, payload),
  closeMenu: () => ipcRenderer.invoke(IPC_CHANNELS.panelsMenuClose),
  getMenuState: (payload) => ipcRenderer.invoke(IPC_CHANNELS.panelsMenuState, payload),
  runMenuAction: (payload) => ipcRenderer.invoke(IPC_CHANNELS.panelsMenuAction, payload),
  openExternal: (payload) => ipcRenderer.invoke(IPC_CHANNELS.panelsOpenExternal, payload),
  goBack: (payload) => ipcRenderer.invoke(IPC_CHANNELS.panelsGoBack, payload),
  onPrepareClose: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: Parameters<typeof callback>[0]
    ) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.panelPrepareClose, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.panelPrepareClose, listener);
  },
  onAnimateIn: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: Parameters<typeof callback>[0]
    ) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.panelAnimateIn, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.panelAnimateIn, listener);
  },
  onAnimateOut: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(IPC_CHANNELS.panelAnimateOut, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.panelAnimateOut, listener);
  },
  onChromeFadeOut: (callback) => {
    const listener = () => callback();
    ipcRenderer.on(IPC_CHANNELS.chromeFadeOut, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.chromeFadeOut, listener);
  },
  onChromeFadeIn: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: Parameters<typeof callback>[0]
    ) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.chromeFadeIn, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.chromeFadeIn, listener);
  },
  onNavigationState: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: Parameters<typeof callback>[0]
    ) => callback(payload);
    ipcRenderer.on(IPC_CHANNELS.panelNavigationState, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.panelNavigationState, listener);
  }
};

contextBridge.exposeInMainWorld('panelAPI', panelAPI);
