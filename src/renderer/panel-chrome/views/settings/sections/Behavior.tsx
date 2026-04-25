import type { AppConfig } from '@shared/types';
import { Slider } from '../components/Slider';
import { Toggle } from '../components/Toggle';

interface Props {
  config: AppConfig;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
}

export function Behavior({ config, updateConfig }: Props): JSX.Element {
  return (
    <div className="space-y-1">
      <h2 className="mb-3 text-base font-medium">行为</h2>
      <Slider
        label="悬停触发延迟"
        min={100}
        max={500}
        step={10}
        unit="ms"
        value={config.behavior.hoverOpenDelayMs}
        onChange={(v) =>
          void updateConfig({ behavior: { ...config.behavior, hoverOpenDelayMs: v } })
        }
      />
      <Slider
        label="离开关闭延迟"
        min={100}
        max={800}
        step={10}
        unit="ms"
        value={config.behavior.hoverCloseDelayMs}
        onChange={(v) =>
          void updateConfig({ behavior: { ...config.behavior, hoverCloseDelayMs: v } })
        }
      />
      <Toggle
        label="隐藏时继续播放音频"
        checked={config.behavior.keepAudioOnHide}
        onChange={(next) =>
          void updateConfig({ behavior: { ...config.behavior, keepAudioOnHide: next } })
        }
      />
    </div>
  );
}
