export type Edge = 'left' | 'right';

export type PanelType = 'web' | 'builtin';

export interface WebPanelConfig {
  url: string;
  openInBrowser: string;
  zoomFactor: number;
  userAgentMode: 'desktop' | 'mobile';
  notificationsSnoozed?: boolean;
  isolatedSession?: boolean;
}

export interface BuiltinPanelConfig {
  widgetId: string;
  targetPanelId?: string;
}

export interface IconSource {
  kind: 'auto' | 'custom' | 'letter';
  path?: string;
  dataUrl?: string;
  fallbackLetter?: string;
  fallbackColor?: string;
}

export interface PanelDescriptor {
  id: string;
  type: PanelType;
  title: string;
  iconSource: IconSource;
  order: number;
  preferredWidth: number;
  web?: WebPanelConfig;
  builtin?: BuiltinPanelConfig;
}

export type ThemeMode = 'system' | 'light' | 'dark' | 'transparent' | 'custom';

export interface AppearanceConfig {
  themeMode: ThemeMode;
  /** '#RRGGBBAA'，仅 themeMode='custom' 时生效 */
  customColor: string;
  /** Dock 底板不透明度 0-100。100=完全不透明，0=全透明 */
  dockOpacity: number;
}

export interface AppConfig {
  schemaVersion: 1;
  app: {
    autoLaunch: boolean;
    autoShowDock: boolean;
    hideOnFullscreen: boolean;
  };
  layout: {
    edge: Edge;
    /** 面板最大宽度，屏幕宽度的百分比（30-100） */
    panelDefaultWidth: number;
    /** 持久化的显示器 ID（screen.getAllDisplays().id）。
     * 缺失或对应显示器已断开时回退到主屏。 */
    displayId?: number;
  };
  behavior: {
    hoverOpenDelayMs: number;
    hoverCloseDelayMs: number;
    keepAudioOnHide: boolean;
  };
  appearance: AppearanceConfig;
  panels: PanelDescriptor[];
  meta: {
    createdAt: string;
    lastUpdatedAt: string;
  };
}

export interface PanelState {
  activePanelId: string | null;
  panelVisible: boolean;
  panelMode: 'hover' | 'pinned';
  edge: Edge;
}

export interface PanelAnimatePayload {
  panelId: string;
  descriptor: PanelDescriptor;
  edge: Edge;
  url: string;
  snapshotDataUrl?: string | null;
  animationDelayMs?: number;
}

export interface PanelChromePayload {
  descriptor: PanelDescriptor;
  edge: Edge;
  url: string;
}

export interface PanelSnapshotPayload {
  panelId: string;
  snapshotDataUrl: string | null;
}

export interface PanelAnimationPayload {
  panelId: string;
  descriptor: PanelDescriptor;
  edge: Edge;
  url: string;
  snapshotDataUrl: string | null;
  animationDelayMs?: number;
}

export interface PanelNavigationPayload {
  panelId: string;
  url: string;
  canGoBack: boolean;
}

export interface PanelLoadingPayload {
  panelId: string;
  isLoading: boolean;
}

export interface PanelMenuState {
  panelId: string;
  currentUrl: string;
  title: string;
  userAgentMode: 'desktop' | 'mobile';
  notificationsSnoozed: boolean;
  canOpenExternal: boolean;
}

export interface PanelMenuAnchor {
  panelId: string;
  x: number;
  y: number;
  edge: Edge;
}

export interface PanelMenuOpenPayload extends PanelMenuAnchor {
  state: PanelMenuState;
}

export interface PanelActionPayload {
  panelId: string;
}

export interface PanelOpenExternalPayload extends PanelActionPayload {
  url?: string;
}

export interface PanelMenuActionPayload extends PanelActionPayload {
  action:
    | 'reload'
    | 'copy-link'
    | 'toggle-mobile-view'
    | 'toggle-notifications-snooze'
    | 'open-edit-site'
    | 'clear-site-data'
    | 'open-site-info';
}

export interface PanelCreatePayload {
  type: 'web';
  title: string;
  iconSource: IconSource;
  preferredWidth: number;
  web: WebPanelConfig;
}

export interface PanelUpdatePayload {
  id: string;
  patch: Partial<Pick<PanelDescriptor, 'title' | 'iconSource' | 'preferredWidth'>> & {
    web?: Partial<WebPanelConfig>;
  };
}

export interface PanelsUpdatedPayload {
  panels: PanelDescriptor[];
  highlightedPanelId?: string | null;
}

export interface FaviconFetchPayload {
  url: string;
}

export interface FaviconFetchResult {
  url: string;
  iconPath: string;
  dataUrl: string;
  source: 'cache' | 'html' | 'favicon' | 'google' | 'letter';
  fallbackLetter: string;
  fallbackColor: string;
}

export interface BrowserInfo {
  id: string;
  name: string;
  path?: string;
  isDefault?: boolean;
}

export interface SiteInfo {
  panelId: string;
  title: string;
  currentUrl: string;
  userAgentMode: 'desktop' | 'mobile';
  notificationsSnoozed: boolean;
  cookieCount: number;
  cacheSizeBytes: number;
  customIconPath?: string;
}

export interface IpcSuccess<T> {
  ok: true;
  data: T;
}

export interface IpcFailure {
  ok: false;
  error: string;
}

export type IpcResult<T> = IpcSuccess<T> | IpcFailure;
