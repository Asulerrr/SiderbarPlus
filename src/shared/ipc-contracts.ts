import type { AppConfig, IpcResult, PanelState } from './types';

export const IPC_CHANNELS = {
  configRead: 'config:read',
  configUpdate: 'config:update',
  panelsList: 'panels:list',
  panelsShow: 'panels:show',
  panelsHide: 'panels:hide',
  panelsRemove: 'panels:remove',
  appHideToTray: 'app:hide-to-tray',
  appToggleDockVisibility: 'app:toggle-dock-visibility',
  panelState: 'panel:state'
} as const;

export interface DockAPI {
  readConfig: () => Promise<IpcResult<AppConfig>>;
  updateConfig: (patch: Partial<AppConfig>) => Promise<IpcResult<AppConfig>>;
  listPanels: () => Promise<IpcResult<AppConfig['panels']>>;
  showPanel: (id: string) => Promise<IpcResult<void>>;
  hidePanels: () => Promise<IpcResult<void>>;
  removePanel: (id: string) => Promise<IpcResult<void>>;
  hideToTray: () => Promise<IpcResult<void>>;
  toggleDockVisibility: () => Promise<IpcResult<boolean>>;
  onPanelState: (callback: (state: PanelState) => void) => () => void;
}

export interface PanelAPI {
  readConfig: () => Promise<IpcResult<AppConfig>>;
}

export interface BuiltinAPI {
  readConfig: () => Promise<IpcResult<AppConfig>>;
}
