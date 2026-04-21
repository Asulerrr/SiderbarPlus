export type Edge = 'left' | 'right';

export type PanelType = 'web' | 'builtin';

export interface WebPanelConfig {
  url: string;
  openInBrowser: string;
  zoomLevel: number;
  userAgentMode: 'desktop' | 'mobile';
}

export interface BuiltinPanelConfig {
  widgetId: string;
}

export interface IconSource {
  kind: 'auto' | 'custom' | 'letter';
  path?: string;
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

export interface AppConfig {
  schemaVersion: 1;
  app: {
    autoLaunch: boolean;
    autoShowDock: boolean;
    hideOnFullscreen: boolean;
  };
  layout: {
    edge: Edge;
    panelDefaultWidth: number;
    pinned: boolean;
  };
  behavior: {
    hoverOpenDelayMs: number;
    hoverCloseDelayMs: number;
    keepAudioOnHide: boolean;
  };
  panels: PanelDescriptor[];
  meta: {
    createdAt: string;
    lastUpdatedAt: string;
  };
}

export interface PanelState {
  activePanelId: string | null;
  pinned: boolean;
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
}

export interface BrowserInfo {
  id: string;
  name: string;
  path?: string;
  isDefault?: boolean;
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
