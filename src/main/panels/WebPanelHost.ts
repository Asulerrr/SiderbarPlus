import { WebContentsView, session } from 'electron';
import { join } from 'node:path';
import type { PanelDescriptor } from '../../shared/types';

export class WebPanelHost {
  private views = new Map<string, WebContentsView>();

  getOrCreateView(descriptor: PanelDescriptor): WebContentsView {
    const existing = this.views.get(descriptor.id);
    if (existing) {
      return existing;
    }

    const view = new WebContentsView({
      webPreferences: {
        partition: 'persist:shared',
        preload: join(__dirname, '../preload/webPanel.js'),
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: false
      }
    });

    view.webContents.setBackgroundThrottling(false);
    view.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    view.webContents.setVisualZoomLevelLimits(1, 3).catch(() => undefined);

    if (descriptor.web?.url) {
      const partition = session.fromPartition('persist:shared', { cache: true });
      void partition.cookies.flushStore();
      view.webContents.loadURL(descriptor.web.url).catch(() => undefined);
    }

    this.views.set(descriptor.id, view);

    return view;
  }

  getView(panelId: string | null): WebContentsView | null {
    if (!panelId) {
      return null;
    }

    return this.views.get(panelId) ?? null;
  }

  getCurrentUrl(panelId: string | null, fallbackUrl: string): string {
    const view = this.getView(panelId);
    return view?.webContents.getURL() || fallbackUrl;
  }

  destroyView(panelId: string): void {
    const view = this.views.get(panelId);
    if (!view) {
      return;
    }

    if (!view.webContents.isDestroyed()) {
      view.webContents.close({ waitForBeforeUnload: false });
    }

    this.views.delete(panelId);
  }
}
