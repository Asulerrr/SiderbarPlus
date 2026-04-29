import { useEffect, useState } from 'react';
import type { AppConfig } from '@shared/types';
import { General } from './sections/General';
import { Appearance } from './sections/Appearance';
import { Behavior } from './sections/Behavior';
import { Data } from './sections/Data';
import { About } from './sections/About';

export interface SettingsColors {
  innerBg: string;
  footerBg: string;
  text: string;
  mutedText: string;
  subtleBorder: string;
  hoverBg: string;
}

function SectionHeading({ label, muted }: { label: string; muted: string }): JSX.Element {
  return (
    <div className="mb-4">
      <span className="font-mono text-[10px] tracking-[0.18em]" style={{ color: muted }}>{label}</span>
    </div>
  );
}

export function SettingsView({ colors }: { colors: SettingsColors }): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    let mounted = true;
    void window.panelAPI.readConfig().then((result) => {
      if (mounted && result.ok) setConfig(result.data);
    });
    return () => { mounted = false; };
  }, []);

  const updateConfig = async (patch: Partial<AppConfig>): Promise<void> => {
    if (!config) return;
    const result = await window.panelAPI.updateConfig(patch);
    if (result.ok) setConfig(result.data);
  };

  if (!config) {
    return (
      <div className="flex h-full items-center justify-center">
        <span className="text-[13px] tracking-cn text-white/25">加载中…</span>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col" style={{ backgroundColor: colors.innerBg }}>
      <div className="shrink-0 px-6 py-5">
        <h2 className="text-[18px] font-semibold tracking-cn" style={{ color: colors.text }}>设置</h2>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-8">
        <div className="mx-auto max-w-[440px] space-y-5">

          <section className="rounded-xl px-5 py-4" style={{ backgroundColor: colors.footerBg }}>
            <SectionHeading label="常规" muted={colors.mutedText} />
            <General config={config} updateConfig={updateConfig} textColor={colors.text} />
          </section>

          <section className="rounded-xl px-5 py-4" style={{ backgroundColor: colors.footerBg }}>
            <SectionHeading label="外观" muted={colors.mutedText} />
            <Appearance config={config} updateConfig={updateConfig} textColor={colors.text} mutedColor={colors.mutedText} />
          </section>

          <section className="rounded-xl px-5 py-4" style={{ backgroundColor: colors.footerBg }}>
            <SectionHeading label="行为" muted={colors.mutedText} />
            <Behavior config={config} updateConfig={updateConfig} textColor={colors.text} />
          </section>

          <section className="rounded-xl px-5 py-4" style={{ backgroundColor: colors.footerBg }}>
            <SectionHeading label="数据" muted={colors.mutedText} />
            <Data colors={colors} />
          </section>

          <section className="rounded-xl px-5 py-4" style={{ backgroundColor: colors.footerBg }}>
            <SectionHeading label="关于" muted={colors.mutedText} />
            <About textColor={colors.text} />
          </section>

        </div>
      </div>
    </div>
  );
}
