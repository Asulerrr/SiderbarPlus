import { useEffect, useState } from 'react';
import { toRenderableIconUrl } from '@shared/iconUrl';
import type { PanelDescriptor } from '@shared/types';

interface DockItemProps {
  panel: PanelDescriptor;
  active: boolean;
  highlighted: boolean;
  dragging: boolean;
  edge: 'left' | 'right';
  onPointerDown: (event: React.PointerEvent<HTMLButtonElement>, panelId: string) => void;
  onHover: (id: string) => void;
  onActivate: (id: string) => void;
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>, panel: PanelDescriptor) => void;
}

const buildFallbackLabel = (panel: PanelDescriptor): string => {
  if (panel.iconSource.kind === 'letter' && panel.iconSource.fallbackLetter) {
    return panel.iconSource.fallbackLetter;
  }

  return panel.title.trim().slice(0, 1).toUpperCase() || '?';
};

const buildFallbackColor = (panel: PanelDescriptor): string =>
  panel.iconSource.fallbackColor ?? '#375a7f';

const buildIconSrc = (panel: PanelDescriptor): string | null => {
  if (panel.iconSource.dataUrl) {
    return panel.iconSource.dataUrl;
  }

  if (panel.iconSource.path) {
    return toRenderableIconUrl(panel.iconSource.path);
  }

  if (panel.iconSource.kind === 'auto' && panel.web?.url) {
    return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(panel.web.url)}`;
  }

  return null;
};

export function DockItem({
  panel,
  active,
  highlighted,
  dragging,
  edge,
  onPointerDown,
  onHover,
  onActivate,
  onContextMenu
}: DockItemProps): JSX.Element {
  const [iconFailed, setIconFailed] = useState(false);
  const [iconLoaded, setIconLoaded] = useState(false);
  const iconSrc = buildIconSrc(panel);

  useEffect(() => {
    setIconFailed(false);
    setIconLoaded(false);
  }, [panel.id, panel.iconSource.path, panel.web?.url]);

  return (
    <button
      type="button"
      title={panel.title}
      onPointerDown={(event) => onPointerDown(event, panel.id)}
      onMouseEnter={() => onHover(panel.id)}
      onClick={() => onActivate(panel.id)}
      onContextMenu={(event) => onContextMenu(event, panel)}
      className={`group relative flex h-11 w-11 items-center justify-center transition-colors ${
        active
          ? 'bg-white/12'
          : highlighted
            ? 'bg-accent/18'
            : 'bg-transparent hover:bg-white/8'
      } ${dragging ? 'cursor-grabbing opacity-60' : 'cursor-pointer'}`}
    >
      {active ? (
        <span
          className={`absolute ${edge === 'right' ? 'left-0' : 'right-0'} h-5 w-0.5 rounded-full bg-accent`}
        />
      ) : null}

      <span
        className={`flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg ${
          highlighted ? 'animate-[dockPulse_560ms_ease-out]' : ''
        }`}
      >
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold text-white ${
            iconLoaded && !iconFailed ? 'hidden' : ''
          }`}
          style={{ backgroundColor: buildFallbackColor(panel) }}
        >
          {buildFallbackLabel(panel)}
        </span>
        {iconSrc && !iconFailed ? (
          <img
            src={iconSrc}
            alt={panel.title}
            className={`h-7 w-7 object-cover ${iconLoaded ? 'block' : 'hidden'}`}
            onLoad={() => setIconLoaded(true)}
            onError={() => {
              setIconFailed(true);
              setIconLoaded(false);
            }}
          />
        ) : null}
      </span>
    </button>
  );
}
