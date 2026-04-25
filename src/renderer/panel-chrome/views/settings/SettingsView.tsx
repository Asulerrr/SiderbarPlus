import { useEffect, useState } from 'react';
import type { AppConfig } from '@shared/types';
import { General } from './sections/General';
import { Appearance } from './sections/Appearance';
import { Behavior } from './sections/Behavior';
import { Data } from './sections/Data';
import { About } from './sections/About';

type SectionKey = 'general' | 'appearance' | 'behavior' | 'data' | 'about';

const NAV_ITEMS: { key: SectionKey; label: string }[] = [
  { key: 'general', label: '常规' },
  { key: 'appearance', label: '外观' },
  { key: 'behavior', label: '行为' },
  { key: 'data', label: '数据' },
  { key: 'about', label: '关于' }
];

export function SettingsView(): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [section, setSection] = useState<SectionKey>('general');

  useEffect(() => {
    let mounted = true;
    void window.panelAPI.readConfig().then((result) => {
      if (mounted && result.ok) {
        setConfig(result.data);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const updateConfig = async (patch: Partial<AppConfig>): Promise<void> => {
    if (!config) return;
    const result = await window.panelAPI.updateConfig(patch);
    if (result.ok) {
      setConfig(result.data);
    }
  };

  if (!config) {
    return <div className="flex h-full items-center justify-center text-white/60">加载中...</div>;
  }

  return (
    <div className="flex h-full">
      <nav className="w-[188px] flex-shrink-0 border-r border-white/8 p-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setSection(item.key)}
            className={`mb-1 flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors ${
              section === item.key ? 'bg-white/10 text-white' : 'text-white/70 hover:bg-white/5'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-auto p-6 text-white">
        {section === 'general' && <General config={config} updateConfig={updateConfig} />}
        {section === 'appearance' && <Appearance config={config} updateConfig={updateConfig} />}
        {section === 'behavior' && <Behavior config={config} updateConfig={updateConfig} />}
        {section === 'data' && <Data />}
        {section === 'about' && <About />}
      </div>
    </div>
  );
}
