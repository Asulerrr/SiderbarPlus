import type { AppConfig, Edge, ThemeMode } from '@shared/types';
import { ColorAlphaPicker } from '../components/ColorAlphaPicker';
import { Radio } from '../components/Radio';
import { Slider } from '../components/Slider';

interface Props {
  config: AppConfig;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
}

export function Appearance({ config, updateConfig }: Props): JSX.Element {
  return (
    <div className="space-y-1">
      <h2 className="mb-3 text-base font-medium">外观</h2>
      <Radio<Edge>
        label="图标栏位置"
        options={[
          { value: 'left', label: '左' },
          { value: 'right', label: '右' },
        ]}
        value={config.layout.edge}
        onChange={(v) => void updateConfig({ layout: { ...config.layout, edge: v } })}
      />
      <Slider
        label="面板默认宽度"
        min={320}
        max={800}
        step={10}
        unit="px"
        value={config.layout.panelDefaultWidth}
        onChange={(v) =>
          void updateConfig({ layout: { ...config.layout, panelDefaultWidth: v } })
        }
      />
      <Radio<ThemeMode>
        label="主题"
        options={[
          { value: 'system', label: '跟随系统' },
          { value: 'light', label: '浅色' },
          { value: 'dark', label: '深色' },
          { value: 'custom', label: '自定义' },
        ]}
        value={config.appearance.themeMode}
        onChange={(v) =>
          void updateConfig({ appearance: { ...config.appearance, themeMode: v } })
        }
      />
      {config.appearance.themeMode === 'custom' && (
        <ColorAlphaPicker
          label="自定义颜色"
          value={config.appearance.customColor}
          onChange={(v) =>
            void updateConfig({ appearance: { ...config.appearance, customColor: v } })
          }
        />
      )}
    </div>
  );
}
