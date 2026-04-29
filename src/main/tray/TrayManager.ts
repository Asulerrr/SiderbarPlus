import { Menu, Tray, nativeImage, app } from 'electron';
import { join } from 'node:path';
import { APP_NAME } from '../../shared/constants';

interface TrayManagerOptions {
  onToggleDock: () => void;
  onShowDock: () => void;
  onHideDock: () => void;
  onOpenSettings: () => void;
  onQuit: () => void;
  isDockVisible: () => boolean;
}

export class TrayManager {
  private tray: Tray | null = null;

  constructor(private readonly options: TrayManagerOptions) {}

  create(): Tray {
    if (this.tray) {
      return this.tray;
    }

    const iconPath = join(app.getAppPath(), 'icon', 'sidebar.ico');
    const image = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });

    this.tray = new Tray(image);
    this.tray.setToolTip(APP_NAME);
    this.tray.on('click', () => {
      this.options.onToggleDock();
      this.refreshMenu();
    });

    this.refreshMenu();

    return this.tray;
  }

  refreshMenu(): void {
    if (!this.tray) {
      return;
    }

    const dockVisible = this.options.isDockVisible();

    this.tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: dockVisible ? '隐藏侧边栏' : '显示侧边栏',
          click: () => {
            if (dockVisible) {
              this.options.onHideDock();
            } else {
              this.options.onShowDock();
            }
            this.refreshMenu();
          }
        },
        { type: 'separator' },
        { label: '设置', click: this.options.onOpenSettings },
        { type: 'separator' },
        { label: '退出', click: this.options.onQuit }
      ])
    );
  }
}
