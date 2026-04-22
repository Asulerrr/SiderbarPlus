import type {
  AppConfig,
  BrowserInfo,
  FaviconFetchPayload,
  FaviconFetchResult,
  IpcResult,
  PanelActionPayload,
  PanelCreatePayload,
  PanelUpdatePayload,
  PanelMenuAnchor,
  PanelAnimationPayload,
  PanelAnimatePayload,
  PanelChromePayload,
  PanelMenuActionPayload,
  PanelMenuOpenPayload,
  PanelMenuState,
  PanelNavigationPayload,
  PanelOpenExternalPayload,
  PanelsUpdatedPayload,
  PanelSnapshotPayload,
  PanelState,
  SiteInfo
} from './types';

export const IPC_CHANNELS = {
  configRead: 'config:read',
  configUpdate: 'config:update',
  panelsList: 'panels:list',
  panelsAdd: 'panels:add',
  panelsUpdate: 'panels:update',
  panelsReorder: 'panels:reorder',
  panelsHover: 'panels:hover',
  panelsShow: 'panels:show',
  panelsHide: 'panels:hide',
  panelsScheduleHide: 'panels:schedule-hide',
  panelsCancelHide: 'panels:cancel-hide',
  panelsMinimize: 'panels:minimize',
  panelsClose: 'panels:close',
  panelsMarkSticky: 'panels:mark-sticky',
  panelsMenuOpen: 'panels:menu-open',
  panelsMenuClose: 'panels:menu-close',
  panelsMenuCloseAndResumeHover: 'panels:menu-close-and-resume-hover',
  panelsMenuState: 'panels:menu-state',
  panelsMenuAction: 'panels:menu-action',
  panelsOpenExternal: 'panels:open-external',
  panelsGoBack: 'panels:go-back',
  panelsPickIcon: 'panels:pick-icon',
  panelsRemove: 'panels:remove',
  panelsContextMenu: 'panels:context-menu',
  panelsGetSiteInfo: 'panels:get-site-info',
  browsersList: 'browsers:list',
  faviconFetch: 'favicon:fetch',
  appHideToTray: 'app:hide-to-tray',
  appToggleDockVisibility: 'app:toggle-dock-visibility',
  panelState: 'panel:state',
  panelsUpdated: 'panels:updated',
  panelPrepareClose: 'panel:prepare-close',
  panelAnimateIn: 'panel:animate-in',
  panelAnimateOut: 'panel:animate-out',
  panelAnimationOpen: 'panel-animation:open',
  panelAnimationClose: 'panel-animation:close',
  panelAnimationReset: 'panel-animation:reset',
  panelMenuHydrate: 'panel-menu:hydrate',
  chromeFadeOut: 'chrome:fade-out',
  chromeFadeIn: 'chrome:fade-in',
  panelNavigationState: 'panel:navigation-state'
} as const;

export interface DockAPI {
  readConfig: () => Promise<IpcResult<AppConfig>>;
  updateConfig: (patch: Partial<AppConfig>) => Promise<IpcResult<AppConfig>>;
  listPanels: () => Promise<IpcResult<AppConfig['panels']>>;
  addPanel: (payload: PanelCreatePayload) => Promise<IpcResult<AppConfig['panels'][number]>>;
  updatePanel: (payload: PanelUpdatePayload) => Promise<IpcResult<AppConfig['panels'][number]>>;
  reorderPanels: (panelIds: string[]) => Promise<IpcResult<void>>;
  hoverPanel: (id: string) => Promise<IpcResult<void>>;
  showPanel: (id: string) => Promise<IpcResult<void>>;
  hidePanels: () => Promise<IpcResult<void>>;
  scheduleHide: () => Promise<IpcResult<void>>;
  cancelHide: () => Promise<IpcResult<void>>;
  removePanel: (id: string) => Promise<IpcResult<void>>;
  openPanelContextMenu: (id: string) => Promise<IpcResult<void>>;
  hideToTray: () => Promise<IpcResult<void>>;
  toggleDockVisibility: () => Promise<IpcResult<boolean>>;
  onPanelState: (callback: (state: PanelState) => void) => () => void;
  onPanelsUpdated: (callback: (payload: PanelsUpdatedPayload) => void) => () => void;
}

export interface PanelAPI {
  readConfig: () => Promise<IpcResult<AppConfig>>;
  addPanel: (payload: PanelCreatePayload) => Promise<IpcResult<AppConfig['panels'][number]>>;
  updatePanel: (payload: PanelUpdatePayload) => Promise<IpcResult<AppConfig['panels'][number]>>;
  listBrowsers: () => Promise<IpcResult<BrowserInfo[]>>;
  fetchFavicon: (payload: FaviconFetchPayload) => Promise<IpcResult<FaviconFetchResult>>;
  pickIcon: () => Promise<IpcResult<string | null>>;
  getSiteInfo: (payload: PanelActionPayload) => Promise<IpcResult<SiteInfo>>;
  minimizePanel: () => Promise<IpcResult<void>>;
  closePanel: () => Promise<IpcResult<void>>;
  markSticky: () => Promise<IpcResult<void>>;
  scheduleHide: () => Promise<IpcResult<void>>;
  cancelHide: () => Promise<IpcResult<void>>;
  openMenu: (payload: PanelMenuAnchor) => Promise<IpcResult<void>>;
  closeMenu: () => Promise<IpcResult<void>>;
  closeMenuAndResumeHover: () => Promise<IpcResult<void>>;
  getMenuState: (payload: PanelActionPayload) => Promise<IpcResult<PanelMenuState>>;
  runMenuAction: (payload: PanelMenuActionPayload) => Promise<IpcResult<PanelMenuState>>;
  openExternal: (payload: PanelOpenExternalPayload) => Promise<IpcResult<void>>;
  goBack: (payload: PanelActionPayload) => Promise<IpcResult<void>>;
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

export interface PanelMenuAPI {
  runMenuAction: (payload: PanelMenuActionPayload) => Promise<IpcResult<PanelMenuState>>;
  getSiteInfo: (payload: PanelActionPayload) => Promise<IpcResult<SiteInfo>>;
  closeMenu: () => Promise<IpcResult<void>>;
  closeMenuAndResumeHover: () => Promise<IpcResult<void>>;
  onHydrate: (callback: (payload: PanelMenuOpenPayload) => void) => () => void;
}
