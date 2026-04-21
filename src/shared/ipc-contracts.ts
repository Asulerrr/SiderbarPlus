import type { AppConfig, IpcResult } from './types';

export const IPC_CHANNELS = {
  configRead: 'config:read',
  configUpdate: 'config:update',
  panelState: 'panel:state'
} as const;

export interface DockAPI {
  readConfig: () => Promise<IpcResult<AppConfig>>;
}

export interface PanelAPI {
  readConfig: () => Promise<IpcResult<AppConfig>>;
}

export interface BuiltinAPI {
  readConfig: () => Promise<IpcResult<AppConfig>>;
}
