import type { AppConfig } from '../../shared/types';
import { DockWindow } from './DockWindow';
import { PanelWindow } from './PanelWindow';

export class WindowManager {
  private dockWindow: DockWindow | null = null;
  private panelWindow: PanelWindow | null = null;

  constructor(private readonly config: AppConfig) {}

  createWindows(): void {
    this.dockWindow = new DockWindow(this.config);
    this.panelWindow = new PanelWindow(this.config);

    this.dockWindow.create();
    this.panelWindow.create();
  }

  getDockWindow(): DockWindow | null {
    return this.dockWindow;
  }

  getPanelWindow(): PanelWindow | null {
    return this.panelWindow;
  }
}
