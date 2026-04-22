import { useEffect, useRef, useState } from 'react';
import { APP_NAME, APP_VERSION, BUILTIN_ADD_SITE_ID } from '@shared/constants';
import { shouldShowDockActiveIndicator } from '@shared/dockLayout';
import type { AppConfig, PanelDescriptor, PanelState } from '@shared/types';
import { DockFooter } from './components/DockFooter';
import { DockIconList } from './components/DockIconList';
import { QuickMenu } from './components/QuickMenu';

export default function App(): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [panels, setPanels] = useState<PanelDescriptor[]>([]);
  const [panelState, setPanelState] = useState<PanelState>({
    activePanelId: null,
    panelVisible: false,
    pinned: false,
    edge: 'right'
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [highlightedPanelId, setHighlightedPanelId] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const hoverTimerRef = useRef<number | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);

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
            edge: configResult.data.layout.edge,
            pinned: configResult.data.layout.pinned
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

    const handleWindowClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setMenuOpen(false);
      }
    };

    window.addEventListener('click', handleWindowClick);

    return () => {
      mounted = false;
      disposePanelState();
      disposePanelsUpdated();
      window.removeEventListener('click', handleWindowClick);
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
    setMenuOpen(false);
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
    }
    const result = await window.dockAPI.showPanel(id);
    if (result.ok) {
      setPanelState((current) => ({ ...current, activePanelId: id, panelVisible: false }));
    }
  };

  const handleHideDock = async (): Promise<void> => {
    setMenuOpen(false);
    await window.dockAPI.hideToTray();
  };

  const handleToggleAutoLaunch = async (): Promise<void> => {
    if (!config) {
      return;
    }

    const result = await window.dockAPI.updateConfig({
      app: {
        ...config.app,
        autoLaunch: !config.app.autoLaunch
      }
    });

    if (result.ok) {
      setConfig(result.data);
    }
  };

  const handleContextMenu = (
    event: React.MouseEvent<HTMLButtonElement>,
    panel: PanelDescriptor
  ): void => {
    event.preventDefault();
    setMenuOpen(false);
    void window.dockAPI.openPanelContextMenu(panel.id);
  };

  const handleShowBuiltinPlaceholder = (): void => {
    if (dragging) {
      return;
    }

    void window.dockAPI.cancelHide();

    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
    }

    if (panelState.activePanelId) {
      void window.dockAPI.hoverPanel(BUILTIN_ADD_SITE_ID);
      return;
    }

    const hoverDelayMs = config?.behavior.hoverOpenDelayMs ?? 200;
    hoverTimerRef.current = window.setTimeout(() => {
      void window.dockAPI.hoverPanel(BUILTIN_ADD_SITE_ID);
    }, hoverDelayMs);
  };

  const edge = config?.layout.edge ?? panelState.edge ?? 'right';
  const activeIndicatorPanelId = shouldShowDockActiveIndicator(panelState)
    ? panelState.activePanelId
    : null;

  return (
    <main
      ref={rootRef}
      className="relative h-screen w-[44px] bg-dock text-white"
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
      <div className="absolute inset-x-0 top-0 bottom-[126px]">
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

      <div className="absolute inset-x-0 bottom-0 z-10">
        <DockFooter
          menuOpen={menuOpen}
          onShowAddSite={handleShowBuiltinPlaceholder}
          onToggleMenu={() => {
            setMenuOpen((current) => !current);
          }}
          onHideDock={() => void handleHideDock()}
        />
      </div>

      {menuOpen && config ? (
        <QuickMenu
          edge={edge}
          autoLaunch={config.app.autoLaunch}
          onToggleAutoLaunch={() => void handleToggleAutoLaunch()}
          onOpenSettings={() => {
            setMenuOpen(false);
            window.alert('设置面板将在 M8 实现。');
          }}
          onOpenAbout={() => {
            setMenuOpen(false);
            window.alert(`${APP_NAME}\n版本 ${APP_VERSION}\nM2 阶段占位入口`);
          }}
        />
      ) : null}

      <span className="sr-only">{config ? `Dock ready on ${edge} edge` : 'Dock loading'}</span>
    </main>
  );
}
