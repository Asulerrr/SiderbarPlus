import { useEffect, useMemo, useRef, useState } from 'react';
import { BUILTIN_ADD_SITE_ID } from '@shared/constants';
import { shouldShowDockActiveIndicator } from '@shared/dockLayout';
import { resolveSurfaceColors } from '@shared/theme';
import type { AppConfig, PanelDescriptor, PanelState } from '@shared/types';
import { DockFooter } from './components/DockFooter';
import { DockIconList } from './components/DockIconList';

export default function App(): JSX.Element {
  useEffect(() => {
    document.documentElement.style.background = 'transparent';
    return () => { document.documentElement.style.background = ''; };
  }, []);

  const [config, setConfig] = useState<AppConfig | null>(null);
  const [panels, setPanels] = useState<PanelDescriptor[]>([]);
  const [panelState, setPanelState] = useState<PanelState>({
    activePanelId: null,
    panelVisible: false,
    panelMode: 'hover',
    edge: 'right'
  });
  const [highlightedPanelId, setHighlightedPanelId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [entering, setEntering] = useState(true);
  const hoverTimerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setEntering(false));
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const dispose = window.dockAPI.onWillShow(() => {
      setEntering(true);
      requestAnimationFrame(() => setEntering(false));
    });
    return () => dispose();
  }, []);

  useEffect(() => {
    let mounted = true;

    void Promise.all([window.dockAPI.readConfig(), window.dockAPI.listPanels()]).then(
      ([configResult, panelsResult]) => {
        if (!mounted) {
          return;
        }

        if (configResult.ok) {
          setConfig(configResult.data);
          setPanelState((current) => ({
            ...current,
            edge: configResult.data.layout.edge
          }));
        }

        if (panelsResult.ok) {
          setPanels(panelsResult.data);
        }
      }
    );

    const disposePanelState = window.dockAPI.onPanelState((nextState) => {
      if (mounted) {
        setPanelState(nextState);
      }
    });

    const disposeConfigChanged = window.dockAPI.onConfigChanged((nextConfig) => {
      if (mounted) {
        setConfig(nextConfig);
      }
    });

    const disposePanelsUpdated = window.dockAPI.onPanelsUpdated((payload) => {
      if (!mounted) {
        return;
      }

      setPanels(payload.panels);
      setHighlightedPanelId(payload.highlightedPanelId ?? null);

      if (payload.highlightedPanelId) {
        window.setTimeout(() => {
          setHighlightedPanelId((current) =>
            current === payload.highlightedPanelId ? null : current
          );
        }, 650);
      }
    });

    return () => {
      mounted = false;
      disposePanelState();
      disposeConfigChanged();
      disposePanelsUpdated();
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  const handleHoverPanel = (id: string): void => {
    if (!config || dragging) {
      return;
    }

    void window.dockAPI.cancelHide();

    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
    }

    if (panelState.activePanelId) {
      void window.dockAPI.hoverPanel(id);
      return;
    }

    hoverTimerRef.current = window.setTimeout(() => {
      void window.dockAPI.hoverPanel(id);
    }, config.behavior.hoverOpenDelayMs);
  };

  const handleActivatePanel = async (id: string): Promise<void> => {
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
    }
    const result = await window.dockAPI.showPanel(id);
    if (result.ok) {
      setPanelState((current) => ({ ...current, activePanelId: id, panelVisible: false }));
    }
  };

  const handleHideDock = async (): Promise<void> => {
    await window.dockAPI.hideToTray();
  };

  const handleContextMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    panel: PanelDescriptor
  ): void => {
    event.preventDefault();
    void window.dockAPI.openPanelContextMenu(panel.id);
  };

  const handleShowBuiltinPlaceholder = (): void => {
    if (dragging) {
      return;
    }
    void window.dockAPI.cancelHide();
    void window.dockAPI.hoverPanel(BUILTIN_ADD_SITE_ID);
  };

  // panelState.edge 由 main 实时推送，是权威来源；config 只用作首屏兜底（IPC 推送前）
  const edge = panelState.edge ?? config?.layout.edge ?? 'right';
  const surface = useMemo(
    () =>
      config
        ? resolveSurfaceColors(config.appearance, true, true)
        : { bg: '#1F1F1F', fg: '#FFFFFFE6' },
    [config]
  );
  const isLight = useMemo(() => {
    const hex = surface.bg.replace(/^#/, '');
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    return (r * 0.299 + g * 0.587 + b * 0.114) > 128;
  }, [surface.bg]);
  const separatorColor = isLight ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.1)';
  const activeIndicatorPanelId = shouldShowDockActiveIndicator(panelState as any)
    ? panelState.activePanelId
    : null;

  return (
    <main
      ref={rootRef}
      className="flex h-screen w-[44px] flex-col text-white"
      style={{
        backgroundColor: surface.bg,
        color: surface.fg,
        transform: entering
          ? `translateX(${edge === 'right' ? '44px' : '-44px'})`
          : 'translateX(0)',
        transition: entering
          ? 'none'
          : 'transform 280ms cubic-bezier(0.22, 0, 0, 1)'
      }}
      onMouseEnter={() => {
        void window.dockAPI.cancelHide();
      }}
      onMouseLeave={() => {
        if (hoverTimerRef.current) {
          window.clearTimeout(hoverTimerRef.current);
        }
        void window.dockAPI.scheduleHide();
      }}
    >
      <div className="flex-1 min-h-0 overflow-hidden">
        <DockIconList
          panels={panels}
          activePanelId={activeIndicatorPanelId}
          highlightedPanelId={highlightedPanelId}
          edge={edge}
          onDragStateChange={setDragging}
          onReorder={(panelIds) => {
            void window.dockAPI.reorderPanels(panelIds);
          }}
          onHover={handleHoverPanel}
          onActivate={(id) => void handleActivatePanel(id)}
          onContextMenu={handleContextMenu}
        />
      </div>

      <DockFooter
        edge={edge}
        fgColor={surface.fg}
        separatorColor={separatorColor}
        onShowAddSite={handleShowBuiltinPlaceholder}
        onOpenQuickMenu={() => {
          void window.dockAPI.openQuickMenu();
        }}
        onHideDock={() => void handleHideDock()}
      />

      <span className="sr-only">{config ? `Dock ready on ${edge} edge` : 'Dock loading'}</span>
    </main>
  );
}
