import type { BuiltinAPI, DockAPI, PanelAnimationAPI, PanelAPI } from './ipc-contracts';

declare global {
  interface Window {
    dockAPI: DockAPI;
    panelAPI: PanelAPI;
    panelAnimationAPI: PanelAnimationAPI;
    builtinAPI: BuiltinAPI;
  }
}

export {};
