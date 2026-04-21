import { useEffect, useState } from 'react';
import type { AppConfig } from '@shared/types';

export default function App(): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);

  useEffect(() => {
    let mounted = true;

    void window.dockAPI.readConfig().then((result) => {
      if (mounted && result.ok) {
        setConfig(result.data);
      }
    });

    return () => {
      mounted = false;
    };
  }, []);

  return (
    <main className="h-screen w-[44px] bg-dock text-white">
      <div className="flex h-full flex-col items-center justify-between py-3">
        <div className="flex flex-col items-center gap-3 pt-1">
          <div className="h-7 w-7 rounded-md border border-white/10 bg-white/10" />
          <div className="h-7 w-7 rounded-md bg-white/5" />
          <div className="h-7 w-7 rounded-md bg-white/5" />
        </div>

        <div className="flex flex-col items-center gap-3 pb-1">
          <div className="h-7 w-7 rounded-md bg-white/5" />
          <div className="h-7 w-7 rounded-md bg-white/5" />
          <div className="h-7 w-7 rounded-md bg-white/5" />
        </div>
      </div>

      <span className="sr-only">
        {config ? `Dock ready on ${config.layout.edge} edge` : 'Dock loading'}
      </span>
    </main>
  );
}
