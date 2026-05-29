import { ExternalLink, Minus, MoreHorizontal, PinOff, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveSurfaceColors } from '@shared/theme';
import type { AppConfig, PanelAnimationPayload } from '@shared/types';

const CONTENT_INSET = 8;
const PANEL_TOP_INSET = 8;

type AnimationPhase = 'closed' | 'opening' | 'open' | 'closing';
type Direction = 'opening' | 'closing';

const OPEN_TRANSITION = 'transform 300ms cubic-bezier(0.22, 0, 0, 1)';
const CLOSE_TRANSITION = 'transform 280ms cubic-bezier(0.4, 0, 0.6, 1)';

export default function App(): JSX.Element {
  const [payload, setPayload] = useState<PanelAnimationPayload | null>(null);
  const [phase, setPhase] = useState<AnimationPhase>('closed');
  const [direction, setDirection] = useState<Direction>('opening');
  const [config, setConfig] = useState<AppConfig | null>(null);
  const timersRef = useRef<number[]>([]);

  useEffect(() => {
    let mounted = true;
    void window.panelAnimationAPI.readConfig().then((result) => {
      if (mounted && result.ok) {
        setConfig(result.data);
      }
    });
    const dispose = window.panelAnimationAPI.onConfigChanged((next) => {
      if (mounted) setConfig(next);
    });
    return () => {
      mounted = false;
      dispose();
    };
  }, []);

  useEffect(() => {
    const clearTimers = (): void => {
      for (const timer of timersRef.current) {
        window.clearTimeout(timer);
      }

      timersRef.current = [];
    };

    const startOpen = (nextPayload: PanelAnimationPayload): void => {
      clearTimers();
      setPayload(nextPayload);
      setDirection('opening');
      setPhase('closed');

      const startTimer = window.setTimeout(() => {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => {
            setPhase('opening');
          });
        });
      }, 20);
      const finishTimer = window.setTimeout(() => {
        setPhase('open');
      }, 320);

      timersRef.current = [startTimer, finishTimer];
    };

    const startClose = (nextPayload: PanelAnimationPayload): void => {
      clearTimers();
      setPayload(nextPayload);
      setDirection('closing');
      setPhase('open');

      const startDelayMs = nextPayload.animationDelayMs ?? 20;
      const startTimer = window.setTimeout(() => {
        setPhase('closing');
      }, startDelayMs);
      const finishTimer = window.setTimeout(() => {
        setPhase('closed');
      }, startDelayMs + 300);

      timersRef.current = [startTimer, finishTimer];
    };

    const disposeOpen = window.panelAnimationAPI.onOpen(startOpen);
    const disposeClose = window.panelAnimationAPI.onClose(startClose);
    const disposeReset = window.panelAnimationAPI.onReset(() => {
      clearTimers();
      setDirection('opening');
      setPhase('closed');
    });

    return () => {
      disposeOpen();
      disposeClose();
      disposeReset();
      clearTimers();
    };
  }, []);

  const edge = payload?.edge ?? 'right';
  const surface = useMemo(
    () =>
      payload?.appearance
        ? resolveSurfaceColors(payload.appearance, true)
        : config
          ? resolveSurfaceColors(config.appearance, true)
          : { bg: '#1b1b1b', fg: '#FFFFFFE6' },
    [payload?.appearance, config]
  );
  const panelCardRadius = edge === 'right' ? 'rounded-l-lg' : 'rounded-r-lg';
  const panelCardBorder = edge === 'right' ? 'border-r-0' : 'border-l-0';
  const closedTransform =
    edge === 'right' ? 'translateX(100%) translateZ(0)' : 'translateX(-100%) translateZ(0)';
  const transform =
    phase === 'opening' || phase === 'open' ? 'translateX(0) translateZ(0)' : closedTransform;
  const transition =
    phase === 'opening' || (phase === 'open' && direction === 'opening')
      ? OPEN_TRANSITION
      : phase === 'closing' || (phase === 'closed' && direction === 'closing')
        ? CLOSE_TRANSITION
        : 'none';

  return (
    <main className="relative h-screen w-full bg-transparent">
      <div
        className="panel-animation-shell absolute inset-0 overflow-hidden text-white"
        style={{ transform, transition, backgroundColor: surface.bg }}
      >
        <div
          className={`absolute flex flex-col overflow-hidden border border-white/[0.05] shadow-[0_0_0_1px_rgba(0,0,0,0.18)] ${panelCardRadius} ${panelCardBorder}`}
          style={{
            left: edge === 'right' ? CONTENT_INSET : 0,
            right: edge === 'left' ? CONTENT_INSET : 0,
            top: PANEL_TOP_INSET,
            bottom: CONTENT_INSET,
            backgroundColor: surface.bg
          }}
        >
          <div className="flex h-[76px] shrink-0 items-center justify-between px-4" style={{ backgroundColor: surface.bg }}>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 pr-3">
              <div className="min-w-0 truncate text-[15px] font-semibold leading-5 text-white">
                {payload?.descriptor.title ?? 'SideBar'}
              </div>
              <div className="min-w-0 truncate text-xs leading-4 text-white/42">
                {payload?.url || '正在准备面板...'}
              </div>
            </div>
            <div className="flex shrink-0 items-center">
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded text-white/72">
                <ExternalLink size={14} />
              </button>
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded text-white/72">
                <MoreHorizontal size={14} />
              </button>
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded text-white/72">
                <PinOff size={14} />
              </button>
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded text-white/72">
                <Minus size={14} />
              </button>
              <button type="button" className="flex h-8 w-8 items-center justify-center rounded text-white/72">
                <X size={14} />
              </button>
            </div>
          </div>
          <div className="relative flex-1 overflow-hidden bg-[#242424]">
            {payload?.snapshotDataUrl ? (
              <img
                src={payload.snapshotDataUrl}
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
