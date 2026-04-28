import { useEffect, useState } from 'react';
import type { AppConfig } from '@shared/types';
import { General } from './sections/General';
import { Appearance } from './sections/Appearance';
import { Behavior } from './sections/Behavior';
import { Data } from './sections/Data';
import { About } from './sections/About';

type SectionKey = 'general' | 'appearance' | 'behavior' | 'data' | 'about';

const NAV_ITEMS: { key: SectionKey; label: string; index: string }[] = [
  { key: 'general', label: '常规', index: '01' },
  { key: 'appearance', label: '外观', index: '02' },
  { key: 'behavior', label: '行为', index: '03' },
  { key: 'data', label: '数据', index: '04' },
  { key: 'about', label: '关于', index: '05' }
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
    return (
      <div className="flex h-full items-center justify-center">
        <span className="font-mono text-[11px] tracking-wider text-white/35">
          LOADING…
        </span>
      </div>
    );
  }

  const activeIndex = NAV_ITEMS.findIndex((item) => item.key === section);

  return (
    <div className="flex h-full">
      <nav className="flex w-[200px] shrink-0 flex-col border-r border-white/6 bg-[#0e0e0e] px-3 py-6">
        <div className="mb-6 px-3">
          <div className="font-mono text-[10px] tracking-[0.22em] text-white/35">
            SETTINGS
          </div>
          <div className="mt-1 font-display text-[18px] font-semibold tracking-cn text-white">
            偏好与配置
          </div>
        </div>
        {NAV_ITEMS.map((item, idx) => {
          const active = idx === activeIndex;
          return (
            <button
              key={item.key}
              type="button"
              onClick={() => setSection(item.key)}
              className="group relative flex w-full items-center gap-3 px-3 py-2.5 text-left transition-colors"
            >
              <span
                className={`font-mono text-[10px] tracking-wider transition-colors ${
                  active ? 'text-amber' : 'text-white/30 group-hover:text-white/55'
                }`}
              >
                {item.index}
              </span>
              <span
                className={`text-[13px] tracking-cn transition-colors ${
                  active ? 'text-white' : 'text-white/55 group-hover:text-white/85'
                }`}
              >
                {item.label}
              </span>
              {active ? (
                <span className="absolute right-0 top-1/2 h-5 w-[2px] -translate-y-1/2 bg-amber" />
              ) : null}
            </button>
          );
        })}
      </nav>
      <div className="flex-1 overflow-auto bg-[#111111]">
        <div
          key={section}
          className="mx-auto max-w-[480px] animate-fade-up px-8 py-10 text-white"
        >
          <div className="mb-8 flex items-baseline gap-3">
            <span className="font-mono text-[10px] tracking-[0.22em] text-white/30">
              {NAV_ITEMS[activeIndex].index}
            </span>
            <h2 className="heading-rule font-display text-[15px] uppercase">
              {NAV_ITEMS[activeIndex].label}
            </h2>
          </div>
          {section === 'general' && <General config={config} updateConfig={updateConfig} />}
          {section === 'appearance' && (
            <Appearance config={config} updateConfig={updateConfig} />
          )}
          {section === 'behavior' && <Behavior config={config} updateConfig={updateConfig} />}
          {section === 'data' && <Data />}
          {section === 'about' && <About />}
        </div>
      </div>
    </div>
  );
}
