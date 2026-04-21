import { useEffect, useRef, useState } from 'react';
import { APP_NAME, APP_VERSION } from '@shared/constants';
import type { AppConfig, PanelDescriptor, PanelState } from '@shared/types';
import { DockFooter } from './components/DockFooter';
import { DockIconList } from './components/DockIconList';
import { QuickMenu } from './components/QuickMenu';

export default function App(): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [panels, setPanels] = useState<PanelDescriptor[]>([]);
  const [panelState, setPanelState] = useState<PanelState>({
    activePanelId: null,
    pinned: false,
    edge: 'right'
  });
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{
    x: number;
    y: number;
    panel: PanelDescriptor;
  } | null>(null);
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

    const handleWindowClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (rootRef.current && !rootRef.current.contains(target)) {
        setMenuOpen(false);
        setContextMenu(null);
      } else if (!(target instanceof HTMLElement && target.closest('[data-context-menu]'))) {
        setContextMenu(null);
      }
    };

    window.addEventListener('click', handleWindowClick);

    return () => {
      mounted = false;
      disposePanelState();
      window.removeEventListener('click', handleWindowClick);
    };
  }, []);

  const reloadPanels = async (): Promise<void> => {
    const result = await window.dockAPI.listPanels();
    if (result.ok) {
      setPanels(result.data);
    }
  };

  const handleActivatePanel = async (id: string): Promise<void> => {
    setMenuOpen(false);
    setContextMenu(null);
    const result = await window.dockAPI.showPanel(id);
    if (result.ok) {
      setPanelState((current) => ({ ...current, activePanelId: id }));
    }
  };

  const handleHideDock = async (): Promise<void> => {
    setMenuOpen(false);
    setContextMenu(null);
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
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      panel
    });
  };

  const handleRemovePanel = async (id: string): Promise<void> => {
    const result = await window.dockAPI.removePanel(id);
    if (result.ok) {
      setContextMenu(null);
      await reloadPanels();
    }
  };

  const handleShowBuiltinPlaceholder = (): void => {
    setPanelState((current) => ({ ...current, activePanelId: null }));
  };

  const edge = config?.layout.edge ?? panelState.edge ?? 'right';

  return (
    <main ref={rootRef} className="relative h-screen w-[44px] bg-dock text-white">
      <div className="absolute inset-x-0 top-0 bottom-[126px]">
        <DockIconList
          panels={panels}
          activePanelId={panelState.activePanelId}
          edge={edge}
          onActivate={(id) => void handleActivatePanel(id)}
          onContextMenu={handleContextMenu}
        />
      </div>

      <div className="absolute inset-x-0 bottom-0 z-10">
        <DockFooter
          menuOpen={menuOpen}
          onShowAddSite={handleShowBuiltinPlaceholder}
          onToggleMenu={() => {
            setContextMenu(null);
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

      {contextMenu ? (
        <div
          data-context-menu
          className="absolute z-30 min-w-[146px] rounded-lg border border-white/8 bg-[#2D2D2D] p-1 shadow-[0_4px_16px_rgba(0,0,0,0.3)]"
          style={{
            left: edge === 'right' ? -154 : 52,
            top: Math.min(contextMenu.y, window.innerHeight - 54)
          }}
        >
          <button
            type="button"
            className="flex w-full items-center rounded-md px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/8"
            onClick={() => void handleRemovePanel(contextMenu.panel.id)}
          >
            从边栏取消固定
          </button>
        </div>
      ) : null}

      <span className="sr-only">{config ? `Dock ready on ${edge} edge` : 'Dock loading'}</span>
    </main>
  );
}
