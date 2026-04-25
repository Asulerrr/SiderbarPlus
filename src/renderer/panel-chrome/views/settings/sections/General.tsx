import type { AppConfig } from '@shared/types';
import { Toggle } from '../components/Toggle';

interface Props {
  config: AppConfig;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
}

export function General({ config, updateConfig }: Props): JSX.Element {
  return (
    <div className="space-y-1">
      <h2 className="mb-3 text-base font-medium">常规</h2>
      <Toggle
        label="开机自启"
        checked={config.app.autoLaunch}
        onChange={(next) => void updateConfig({ app: { ...config.app, autoLaunch: next } })}
      />
      <Toggle
        label="启动时显示侧边栏"
        checked={config.app.autoShowDock}
        onChange={(next) => void updateConfig({ app: { ...config.app, autoShowDock: next } })}
      />
      <Toggle
        label="全屏自动隐藏"
        checked={config.app.hideOnFullscreen}
        onChange={(next) => void updateConfig({ app: { ...config.app, hideOnFullscreen: next } })}
      />
    </div>
  );
}
