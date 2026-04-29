import type { AppConfig } from '@shared/types';
import { Toggle } from '../components/Toggle';

interface Props {
  config: AppConfig;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
  textColor: string;
}

export function General({ config, updateConfig, textColor }: Props): JSX.Element {
  return (
    <div className="divide-y divide-white/5">
      <Toggle label="开机自启" checked={config.app.autoLaunch} textColor={textColor} onChange={(next) => void updateConfig({ app: { ...config.app, autoLaunch: next } })} />
      <Toggle label="启动时显示侧边栏" checked={config.app.autoShowDock} textColor={textColor} onChange={(next) => void updateConfig({ app: { ...config.app, autoShowDock: next } })} />
      <Toggle label="全屏自动隐藏" checked={config.app.hideOnFullscreen} textColor={textColor} onChange={(next) => void updateConfig({ app: { ...config.app, hideOnFullscreen: next } })} />
    </div>
  );
}
