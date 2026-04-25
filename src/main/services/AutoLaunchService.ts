import AutoLaunch from 'auto-launch';
import { app } from 'electron';
import { APP_NAME } from '../../shared/constants';
import { logger } from '../utils/logger';

/**
 * PRD §5.9.1 / §7.3 开机自启
 *
 * - 通过 auto-launch 写注册表 HKCU\...\Run\<APP_NAME>
 * - 启动参数附带 --autostart，main 入口据此判断静默启动
 * - 仅 packaged 状态下生效；dev 启动入口是 electron CLI，注册到注册表无意义
 */
export class AutoLaunchService {
  private readonly handle: AutoLaunch | null;

  constructor() {
    if (!app.isPackaged) {
      this.handle = null;
      return;
    }

    this.handle = new AutoLaunch({
      name: APP_NAME,
      path: app.getPath('exe'),
      // 通过 args 注入 --autostart；isHidden 在 Windows 不可靠，不依赖
      args: ['--autostart']
    });
  }

  /** 让系统注册表状态与 desired 对齐。dev 模式下空操作。 */
  async sync(desired: boolean): Promise<void> {
    if (!this.handle) {
      logger.info('AutoLaunchService.sync skipped (dev or unsupported)', { desired });
      return;
    }

    try {
      const current = await this.handle.isEnabled();
      if (current === desired) {
        return;
      }

      if (desired) {
        await this.handle.enable();
      } else {
        await this.handle.disable();
      }
      logger.info('AutoLaunchService.sync applied', { from: current, to: desired });
    } catch (error) {
      logger.error('AutoLaunchService.sync failed', error);
    }
  }
}
