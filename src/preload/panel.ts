import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, type PanelAPI } from '../shared/ipc-contracts';

const panelAPI: PanelAPI = {
  readConfig: () => ipcRenderer.invoke(IPC_CHANNELS.configRead),
  addPanel: (payload) => ipcRenderer.invoke(IPC_CHANNELS.panelsAdd, payload),
  updatePanel: (payload) => ipcRenderer.invoke(IPC_CHANNELS.panelsUpdate, payload),
  listBrowsers: () => ipcRenderer.invoke(IPC_CHANNELS.browsersList),
  fetchFavicon: (payload) => ipcRenderer.invoke(IPC_CHANNELS.faviconFetch, payload),
  pickIcon: () => ipcRenderer.invoke(IPC_CHANNELS.panelsPickIcon),
  getSiteInfo: (payload) => ipcRenderer.invoke(IPC_CHANNELS.panelsGetSiteInfo, payload),
  minimizePanel: () => ipcRenderer.invoke(IPC_CHANNELS.panelsMinimize),
  closePanel: () => ipcRenderer.invoke(IPC_CHANNELS.panelsClose),
  markSticky: () => ipcRenderer.invoke(IPC_CHANNELS.panelsMarkSticky),
  scheduleHide: () => ipcRenderer.invoke(IPC_CHANNELS.panelsScheduleHide),
  cancelHide: () => ipcRenderer.invoke(IPC_CHANNELS.panelsCancelHide),
  openMenu: (payload) => ipcRenderer.invoke(IPC_CHANNELS.panelsMenuOpen, payload),
  closeMenu: () => ipcRenderer.invoke(IPC_CHANNELS.panelsMenuClose),
  closeMenuAndResumeHover: () => ipcRenderer.invoke(IPC_CHANNELS.panelsMenuCloseAndResumeHover),
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
  },
  onPanelState: (callback) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      state: Parameters<typeof callback>[0]
    ) => callback(state);
    ipcRenderer.on(IPC_CHANNELS.panelState, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.panelState, listener);
  },
  togglePin: () => ipcRenderer.invoke(IPC_CHANNELS.panelTogglePin),
  commitResize: (width) => ipcRenderer.invoke(IPC_CHANNELS.panelCommitResize, width)
};

contextBridge.exposeInMainWorld('panelAPI', panelAPI);
