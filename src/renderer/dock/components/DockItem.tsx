import { useEffect, useState } from 'react';
import { getDockActiveIndicatorSide } from '@shared/dockLayout';
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
  const iconSrc = buildIconSrc(panel);
  const activeIndicatorSide = getDockActiveIndicatorSide(edge);

  useEffect(() => {
    setIconFailed(false);
  }, [panel.id, panel.iconSource.path, panel.iconSource.dataUrl, panel.web?.url]);

  // 图标在 44px dock 中居中；热区 36×36 距边缘左5/右3（或左3/右5）
  const iconPadLeft = edge === 'right' ? 9 : 7;

  return (
    <button
      type="button"
      title={panel.title}
      onPointerDown={(event) => onPointerDown(event, panel.id)}
      onDragStart={(event) => event.preventDefault()}
      onMouseEnter={() => onHover(panel.id)}
      onClick={() => onActivate(panel.id)}
      onContextMenu={(event) => onContextMenu(event, panel)}
      className={`group relative flex h-[36px] w-[36px] shrink-0 items-center rounded-xl transition-colors ${
        active
          ? 'bg-white/12'
          : highlighted
            ? 'bg-accent/18'
            : 'bg-transparent hover:bg-white/8'
      } ${dragging ? 'cursor-grabbing' : 'cursor-pointer'}`}
      style={{ paddingLeft: iconPadLeft, paddingRight: 36 - 20 - iconPadLeft }}
    >
      {active ? (
        <span
          className={`absolute ${activeIndicatorSide === 'right' ? 'right-0' : 'left-0'} h-5 w-0.5 rounded-full bg-accent`}
        />
      ) : null}

      <span
        className={`relative h-5 w-5 shrink-0 overflow-hidden rounded-md ${
          highlighted ? 'animate-[dockPulse_560ms_ease-out]' : ''
        }`}
      >
        {/* 仅字母 fallback 显示颜色底板；图片图标（favicon/自定义）无需背景 */}
        {!iconSrc || iconFailed ? (
          <span
            className="absolute inset-0 flex items-center justify-center rounded-lg text-xs font-semibold text-white"
            style={{ backgroundColor: buildFallbackColor(panel) }}
          >
            {buildFallbackLabel(panel)}
          </span>
        ) : null}
        {iconSrc && !iconFailed ? (
          <img
            src={iconSrc}
            alt={panel.title}
            draggable={false}
            className="absolute inset-0 h-5 w-5 rounded-md object-cover"
            onError={() => setIconFailed(true)}
          />
        ) : null}
      </span>
    </button>
  );
}
