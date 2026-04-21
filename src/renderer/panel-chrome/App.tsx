import { useEffect, useState } from 'react';
import type { AppConfig } from '@shared/types';

export default function App(): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);

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

  return (
    <main className="flex h-screen w-full items-center justify-center bg-[#202020] text-sm text-white/60">
      <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-3">
        {config ? 'Panel renderer ready for M1' : 'Loading panel renderer...'}
      </div>
    </main>
  );
}
