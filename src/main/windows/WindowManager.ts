import type { AppConfig } from '../../shared/types';
import type { ConfigStore } from '../store/ConfigStore';
import { PanelManager } from '../panels/PanelManager';
import { PanelAnimationWindow } from './PanelAnimationWindow';
import { DockWindow } from './DockWindow';
import { PanelWindow } from './PanelWindow';

export class WindowManager {
  private dockWindow: DockWindow | null = null;
  private panelWindow: PanelWindow | null = null;
  private panelAnimationWindow: PanelAnimationWindow | null = null;
  private panelManager: PanelManager | null = null;

  constructor(
    private readonly config: AppConfig,
    private readonly configStore: ConfigStore,
    private readonly emitPanelState: (state: {
      activePanelId: string | null;
      pinned: boolean;
      edge: 'left' | 'right';
    }) => void
  ) {}

  createWindows(): void {
    this.dockWindow = new DockWindow(this.config);
    this.panelWindow = new PanelWindow(this.config);
    this.panelAnimationWindow = new PanelAnimationWindow(this.config);

    this.dockWindow.create();
    this.panelWindow.create();
    this.panelAnimationWindow.create();
    this.panelManager = new PanelManager(
      this.configStore,
      this.panelWindow,
      this.panelAnimationWindow,
      this.emitPanelState
    );
  }

  getDockWindow(): DockWindow | null {
    return this.dockWindow;
  }

  getPanelWindow(): PanelWindow | null {
    return this.panelWindow;
  }

  hideDockToTray(): void {
    this.dockWindow?.hide();
    this.panelWindow?.hide();
  }

  showDockFromTray(): void {
    this.dockWindow?.show();
  }

  toggleDockVisibility(): boolean {
    if (this.dockWindow?.isVisible()) {
      this.hideDockToTray();
      return false;
    }

    this.showDockFromTray();
    return true;
  }

  isDockVisible(): boolean {
    return this.dockWindow?.isVisible() ?? false;
  }

  async hoverPanel(panelId: string): Promise<void> {
    await this.panelManager?.hoverPanel(panelId);
  }

  async showPanel(panelId: string, sticky = false): Promise<void> {
    await this.panelManager?.showPanel(panelId, sticky);
  }

  scheduleHidePanel(destroy = false): void {
    this.panelManager?.scheduleHide(destroy);
  }

  cancelScheduledHide(): void {
    this.panelManager?.cancelScheduledHide();
  }

  async hidePanel(destroy = false): Promise<void> {
    await this.panelManager?.hidePanel(destroy);
  }

  markPanelSticky(): void {
    this.panelManager?.markSticky();
  }

  getActivePanelId(): string | null {
    return this.panelManager?.getCurrentPanelId() ?? null;
  }
}
