import type { BuiltinAPI, DockAPI, PanelAPI } from './ipc-contracts';

declare global {
  interface Window {
    dockAPI: DockAPI;
    panelAPI: PanelAPI;
    builtinAPI: BuiltinAPI;
  }
}

export {};
