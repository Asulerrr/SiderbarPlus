import { useEffect, useState } from 'react';
import type { PanelDescriptor } from '@shared/types';

interface DockItemProps {
  panel: PanelDescriptor;
  active: boolean;
  edge: 'left' | 'right';
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

const normalizeIconPath = (iconPath: string): string => {
  if (/^(https?:|data:|file:)/.test(iconPath)) {
    return iconPath;
  }

  return `file:///${iconPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, '$1:')}`;
};

const buildIconSrc = (panel: PanelDescriptor): string | null => {
  if (panel.iconSource.path) {
    return normalizeIconPath(panel.iconSource.path);
  }

  if (panel.iconSource.kind === 'auto' && panel.web?.url) {
    return `https://www.google.com/s2/favicons?sz=64&domain_url=${encodeURIComponent(panel.web.url)}`;
  }

  return null;
};

export function DockItem({
  panel,
  active,
  edge,
  onActivate,
  onContextMenu
}: DockItemProps): JSX.Element {
  const [iconFailed, setIconFailed] = useState(false);
  const iconSrc = buildIconSrc(panel);

  useEffect(() => {
    setIconFailed(false);
  }, [panel.id, panel.iconSource.path, panel.web?.url]);

  return (
    <button
      type="button"
      title={panel.title}
      onMouseEnter={() => onActivate(panel.id)}
      onClick={() => onActivate(panel.id)}
      onContextMenu={(event) => onContextMenu(event, panel)}
      className={`group relative flex h-11 w-11 items-center justify-center transition-colors ${
        active ? 'bg-white/12' : 'bg-transparent hover:bg-white/8'
      }`}
    >
      {active ? (
        <span
          className={`absolute ${edge === 'right' ? 'left-0' : 'right-0'} h-5 w-0.5 rounded-full bg-accent`}
        />
      ) : null}

      <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-lg">
        {iconSrc && !iconFailed ? (
          <img
            src={iconSrc}
            alt={panel.title}
            className="h-7 w-7 object-cover"
            onError={() => setIconFailed(true)}
          />
        ) : (
          <span
            className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-semibold text-white"
            style={{ backgroundColor: buildFallbackColor(panel) }}
          >
            {buildFallbackLabel(panel)}
          </span>
        )}
      </span>
    </button>
  );
}
