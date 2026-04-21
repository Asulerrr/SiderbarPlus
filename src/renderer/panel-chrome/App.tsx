import { Minus, MoreHorizontal, PinOff, ExternalLink, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AppConfig, PanelAnimatePayload, PanelChromePayload, PanelNavigationPayload } from '@shared/types';

const CONTENT_INSET = 8;
const PANEL_TOP_INSET = 8;

interface ChromeState {
  panelId: string | null;
  title: string;
  url: string;
  edge: 'left' | 'right';
}

export default function App(): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [chromeState, setChromeState] = useState<ChromeState>({
    panelId: null,
    title: 'SideBar Plus',
    url: '',
    edge: 'right'
  });
  const [fading, setFading] = useState(false);
  const [contentSnapshotDataUrl, setContentSnapshotDataUrl] = useState<string | null>(null);
  const panelCardRadius = chromeState.edge === 'right' ? 'rounded-l-lg' : 'rounded-r-lg';
  const panelCardBorder = chromeState.edge === 'right' ? 'border-r-0' : 'border-l-0';

  useEffect(() => {
    let mounted = true;

    void window.panelAPI.readConfig().then((result) => {
      if (mounted && result.ok) {
        setConfig(result.data);
      }
    });

    const applyPayload = (payload: PanelAnimatePayload | PanelChromePayload): void => {
      setChromeState({
        panelId: 'panelId' in payload ? payload.panelId : payload.descriptor.id,
        title: payload.descriptor.title,
        url: payload.url,
        edge: payload.edge
      });
    };

    const disposeAnimateIn = window.panelAPI.onAnimateIn((payload) => {
      applyPayload(payload);
      setFading(false);
      setContentSnapshotDataUrl(payload.snapshotDataUrl ?? null);
    });

    const disposeAnimateOut = window.panelAPI.onAnimateOut(() => {
      setContentSnapshotDataUrl(null);
    });

    const disposePrepareClose = window.panelAPI.onPrepareClose((payload) => {
      setChromeState((current) =>
        current.panelId === payload.panelId
          ? {
              ...current
            }
          : current
      );
      setContentSnapshotDataUrl(payload.snapshotDataUrl);
    });

    const disposeFadeOut = window.panelAPI.onChromeFadeOut(() => {
      setFading(true);
    });

    const disposeFadeIn = window.panelAPI.onChromeFadeIn((payload) => {
      applyPayload(payload);
      setFading(false);
    });

    const disposeNavigation = window.panelAPI.onNavigationState((payload: PanelNavigationPayload) => {
      setChromeState((current) =>
        current.panelId === payload.panelId ? { ...current, url: payload.url } : current
      );
    });

    return () => {
      mounted = false;
      disposePrepareClose();
      disposeAnimateIn();
      disposeAnimateOut();
      disposeFadeOut();
      disposeFadeIn();
      disposeNavigation();
    };
  }, []);

  return (
    <main
      className="relative h-screen w-full bg-transparent"
      onMouseEnter={() => {
        void window.panelAPI.cancelHide();
      }}
      onMouseLeave={() => {
        void window.panelAPI.scheduleHide();
      }}
      onMouseDown={() => {
        void window.panelAPI.markSticky();
      }}
    >
      <div
        className="panel-shell absolute inset-0 overflow-hidden bg-[#1b1b1b] text-white"
      >
        <div
          className={`absolute flex flex-col overflow-hidden border border-white/6 bg-[#202020] shadow-[0_0_0_1px_rgba(0,0,0,0.18)] ${panelCardRadius} ${panelCardBorder}`}
          style={{
            left: chromeState.edge === 'right' ? CONTENT_INSET : 0,
            right: chromeState.edge === 'left' ? CONTENT_INSET : 0,
            top: PANEL_TOP_INSET,
            bottom: CONTENT_INSET
          }}
        >
          <div
            className={`flex h-[76px] shrink-0 items-center justify-between bg-[#202020] px-4 transition-opacity duration-100 ${
              fading ? 'opacity-0' : 'opacity-100'
            }`}
          >
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 pr-3">
              <div className="min-w-0 truncate text-[15px] font-semibold leading-5 text-white">{chromeState.title}</div>
              <div className="min-w-0 truncate text-xs leading-4 text-white/42">
                {chromeState.url || (config ? '正在准备面板...' : 'Loading panel...')}
              </div>
            </div>
            <div className="flex shrink-0 items-center">
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded text-white/72 hover:bg-white/8">
                <ExternalLink size={14} />
              </button>
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded text-white/72 hover:bg-white/8">
                <MoreHorizontal size={14} />
              </button>
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded text-white/72 hover:bg-white/8">
                <PinOff size={14} />
              </button>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded text-white/72 hover:bg-white/8"
                onClick={() => void window.panelAPI.minimizePanel()}
              >
                <Minus size={14} />
              </button>
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center rounded text-white/72 hover:bg-white/8"
                onClick={() => void window.panelAPI.closePanel()}
              >
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="relative flex-1 overflow-hidden bg-[#242424]">
            {contentSnapshotDataUrl ? (
              <img
                src={contentSnapshotDataUrl}
                alt=""
                draggable={false}
                className="absolute inset-0 h-full w-full object-fill"
              />
            ) : (
              <div className="absolute inset-0 flex items-start justify-start bg-[#242424] p-4">
                <div className="h-2 w-2 rounded-full border border-white/18" />
              </div>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
