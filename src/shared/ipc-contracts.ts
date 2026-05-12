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
  PanelLoadingPayload,
  PanelNavigationPayload,
  PanelOpenExternalPayload,
  PanelsUpdatedPayload,
  PanelSnapshotPayload,
  PanelState,
  SiteInfo
} from './types';

export interface UpdateCheckResult {
  current: string;
  latest: string | null;
  status: 'up-to-date' | 'available' | 'no-remote' | 'error';
  url?: string;
  error?: string;
}

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
  appOpenQuickMenu: 'app:open-quick-menu',
  appCycleDisplay: 'app:cycle-display',
  dockWillShow: 'dock:will-show',
  panelState: 'panel:state',
  panelsUpdated: 'panels:updated',
  configChanged: 'config:changed',
  panelPrepareClose: 'panel:prepare-close',
  panelAnimateIn: 'panel:animate-in',
  panelAnimateOut: 'panel:animate-out',
  panelAnimationOpen: 'panel-animation:open',
  panelAnimationClose: 'panel-animation:close',
  panelAnimationReset: 'panel-animation:reset',
  panelMenuHydrate: 'panel-menu:hydrate',
  chromeFadeOut: 'chrome:fade-out',
  chromeFadeIn: 'chrome:fade-in',
  panelNavigationState: 'panel:navigation-state',
  panelLoadingState: 'panel:loading-state',
  panelCopyToast: 'panel:copy-toast',
  panelTogglePin: 'panel:toggle-pin',
  panelCommitResize: 'panel:commit-resize',
  panelResizeDrag: 'panel:resize-drag',
  settingsOpenConfigFolder: 'settings:open-config-folder',
  settingsExportConfig: 'settings:export-config',
  settingsImportConfig: 'settings:import-config',
  settingsClearStorageData: 'settings:clear-storage-data',
  settingsCheckUpdate: 'settings:check-update',
  settingsQuitApp: 'settings:quit-app'
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
  openQuickMenu: () => Promise<IpcResult<void>>;
  onWillShow: (callback: () => void) => () => void;
  onPanelState: (callback: (state: PanelState) => void) => () => void;
  onPanelsUpdated: (callback: (payload: PanelsUpdatedPayload) => void) => () => void;
  onConfigChanged: (callback: (config: AppConfig) => void) => () => void;
}

export interface PanelAPI {
  readConfig: () => Promise<IpcResult<AppConfig>>;
  updateConfig: (patch: Partial<AppConfig>) => Promise<IpcResult<AppConfig>>;
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
  onLoadingState: (callback: (payload: PanelLoadingPayload) => void) => () => void;
  onCopyToast: (callback: () => void) => () => void;
  onPanelState: (callback: (state: PanelState) => void) => () => void;
  onConfigChanged: (callback: (config: AppConfig) => void) => () => void;
  togglePin: () => Promise<IpcResult<void>>;
  commitResize: (width: number) => Promise<IpcResult<void>>;
  resizeDrag: (width: number) => void;
  openConfigFolder: () => Promise<IpcResult<void>>;
  exportConfig: () => Promise<IpcResult<{ canceled: boolean; path?: string }>>;
  importConfig: () => Promise<IpcResult<{ canceled: boolean; restartRequired: boolean }>>;
  clearStorageData: () => Promise<IpcResult<void>>;
  checkUpdate: () => Promise<IpcResult<UpdateCheckResult>>;
  quitApp: () => Promise<IpcResult<void>>;
}

export interface BuiltinAPI {
  readConfig: () => Promise<IpcResult<AppConfig>>;
}

export interface PanelAnimationAPI {
  readConfig: () => Promise<IpcResult<AppConfig>>;
  onOpen: (callback: (payload: PanelAnimationPayload) => void) => () => void;
  onClose: (callback: (payload: PanelAnimationPayload) => void) => () => void;
  onReset: (callback: () => void) => () => void;
  onConfigChanged: (callback: (config: AppConfig) => void) => () => void;
}

export interface PanelMenuAPI {
  runMenuAction: (payload: PanelMenuActionPayload) => Promise<IpcResult<PanelMenuState>>;
  getSiteInfo: (payload: PanelActionPayload) => Promise<IpcResult<SiteInfo>>;
  closeMenu: () => Promise<IpcResult<void>>;
  closeMenuAndResumeHover: () => Promise<IpcResult<void>>;
  onHydrate: (callback: (payload: PanelMenuOpenPayload) => void) => () => void;
}
