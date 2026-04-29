import type { AppConfig, Edge, ThemeMode } from '@shared/types';
import { ColorAlphaPicker } from '../components/ColorAlphaPicker';
import { Radio } from '../components/Radio';
import { Slider } from '../components/Slider';

interface Props {
  config: AppConfig;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
  textColor: string;
  mutedColor: string;
}

export function Appearance({ config, updateConfig, textColor, mutedColor }: Props): JSX.Element {
  return (
    <div className="divide-y divide-white/5">
      <Radio<Edge>
        label="图标栏位置"
        textColor={textColor}
        mutedColor={mutedColor}
        options={[{ value: 'left', label: '左' }, { value: 'right', label: '右' }]}
        value={config.layout.edge}
        onChange={(v) => void updateConfig({ layout: { ...config.layout, edge: v } })}
      />
      <Slider
        label="面板最大宽度"
        min={25} max={100} step={5} unit="%" textColor={textColor}
        value={Math.min(100, Math.max(25, config.layout.panelDefaultWidth))}
        onChange={(v) => void updateConfig({ layout: { ...config.layout, panelDefaultWidth: v } })}
      />
      <Radio<ThemeMode>
        label="主题"
        textColor={textColor}
        mutedColor={mutedColor}
        options={[
          { value: 'system', label: '跟随系统' }, { value: 'light', label: '浅色' },
          { value: 'dark', label: '深色' }, { value: 'transparent', label: '透明色' },
          { value: 'custom', label: '自定义' }
        ]}
        value={config.appearance.themeMode}
        onChange={(v) => {
          const patch: Partial<AppConfig> = { appearance: { ...config.appearance, themeMode: v } };
          if (v === 'transparent') {
            patch.appearance!.dockOpacity = 0;
          }
          void updateConfig(patch);
        }}
      />
      {config.appearance.themeMode === 'transparent' && (
        <Slider
          label="Dock 底板透明度"
          min={0} max={100} step={5} unit="%" textColor={textColor}
          value={config.appearance.dockOpacity ?? 0}
          onChange={(v) => void updateConfig({ appearance: { ...config.appearance, dockOpacity: v } })}
        />
      )}
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
