import type { BuiltinAPI, DockAPI, PanelAnimationAPI, PanelAPI, PanelMenuAPI } from './ipc-contracts';

declare global {
  interface Window {
    dockAPI: DockAPI;
    panelAPI: PanelAPI;
    panelAnimationAPI: PanelAnimationAPI;
    panelMenuAPI: PanelMenuAPI;
    builtinAPI: BuiltinAPI;
  }
}

export {};
