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

export interface IpcSuccess<T> {
  ok: true;
  data: T;
}

export interface IpcFailure {
  ok: false;
  error: string;
}

export type IpcResult<T> = IpcSuccess<T> | IpcFailure;
