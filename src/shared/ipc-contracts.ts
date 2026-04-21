import type {
  AppConfig,
  IpcResult,
  PanelAnimationPayload,
  PanelAnimatePayload,
  PanelChromePayload,
  PanelNavigationPayload,
  PanelSnapshotPayload,
  PanelState
} from './types';

export const IPC_CHANNELS = {
  configRead: 'config:read',
  configUpdate: 'config:update',
  panelsList: 'panels:list',
  panelsHover: 'panels:hover',
  panelsShow: 'panels:show',
  panelsHide: 'panels:hide',
  panelsScheduleHide: 'panels:schedule-hide',
  panelsCancelHide: 'panels:cancel-hide',
  panelsMinimize: 'panels:minimize',
  panelsClose: 'panels:close',
  panelsMarkSticky: 'panels:mark-sticky',
  panelsRemove: 'panels:remove',
  appHideToTray: 'app:hide-to-tray',
  appToggleDockVisibility: 'app:toggle-dock-visibility',
  panelState: 'panel:state',
  panelPrepareClose: 'panel:prepare-close',
  panelAnimateIn: 'panel:animate-in',
  panelAnimateOut: 'panel:animate-out',
  panelAnimationOpen: 'panel-animation:open',
  panelAnimationClose: 'panel-animation:close',
  panelAnimationReset: 'panel-animation:reset',
  chromeFadeOut: 'chrome:fade-out',
  chromeFadeIn: 'chrome:fade-in',
  panelNavigationState: 'panel:navigation-state'
} as const;

export interface DockAPI {
  readConfig: () => Promise<IpcResult<AppConfig>>;
  updateConfig: (patch: Partial<AppConfig>) => Promise<IpcResult<AppConfig>>;
  listPanels: () => Promise<IpcResult<AppConfig['panels']>>;
  hoverPanel: (id: string) => Promise<IpcResult<void>>;
  showPanel: (id: string) => Promise<IpcResult<void>>;
  hidePanels: () => Promise<IpcResult<void>>;
  scheduleHide: () => Promise<IpcResult<void>>;
  cancelHide: () => Promise<IpcResult<void>>;
  removePanel: (id: string) => Promise<IpcResult<void>>;
  hideToTray: () => Promise<IpcResult<void>>;
  toggleDockVisibility: () => Promise<IpcResult<boolean>>;
  onPanelState: (callback: (state: PanelState) => void) => () => void;
}

export interface PanelAPI {
  readConfig: () => Promise<IpcResult<AppConfig>>;
  minimizePanel: () => Promise<IpcResult<void>>;
  closePanel: () => Promise<IpcResult<void>>;
  markSticky: () => Promise<IpcResult<void>>;
  scheduleHide: () => Promise<IpcResult<void>>;
  cancelHide: () => Promise<IpcResult<void>>;
  onPrepareClose: (callback: (payload: PanelSnapshotPayload) => void) => () => void;
  onAnimateIn: (callback: (payload: PanelAnimatePayload) => void) => () => void;
  onAnimateOut: (callback: () => void) => () => void;
  onChromeFadeOut: (callback: () => void) => () => void;
  onChromeFadeIn: (callback: (payload: PanelChromePayload) => void) => () => void;
  onNavigationState: (callback: (payload: PanelNavigationPayload) => void) => () => void;
}

export interface BuiltinAPI {
  readConfig: () => Promise<IpcResult<AppConfig>>;
}

export interface PanelAnimationAPI {
  onOpen: (callback: (payload: PanelAnimationPayload) => void) => () => void;
  onClose: (callback: (payload: PanelAnimationPayload) => void) => () => void;
  onReset: (callback: () => void) => () => void;
}
