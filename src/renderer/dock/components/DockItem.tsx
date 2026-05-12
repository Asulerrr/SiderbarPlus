import { useEffect, useRef, useState } from 'react';
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
    try {
      const host = new URL(panel.web.url).hostname;
      return `https://icons.duckduckgo.com/ip3/${host}.ico`;
    } catch {
      return null;
    }
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
  const [retryTick, setRetryTick] = useState(0);
  const retryTimerRef = useRef<number | null>(null);
  const iconSrc = buildIconSrc(panel);
  const activeIndicatorSide = getDockActiveIndicatorSide(edge);

  useEffect(() => {
    setIconFailed(false);
    setRetryTick(0);
    if (retryTimerRef.current) {
      window.clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, [panel.id, panel.iconSource.path, panel.iconSource.dataUrl, panel.web?.url]);

  // auto 图标无 VPN 时加载失败 → 递增延迟重试（5s / 10s / 20s / 40s）
  useEffect(() => {
    if (!iconFailed || panel.iconSource.kind !== 'auto' || !panel.web?.url) {
      return;
    }
    // 最多重试 5 次，之后保持字母 fallback
    if (retryTick >= 5) {
      return;
    }
    const delay = Math.min(5000 * Math.pow(2, retryTick), 40000);
    retryTimerRef.current = window.setTimeout(() => {
      setIconFailed(false);
      setRetryTick((t) => t + 1);
    }, delay);
    return () => {
      if (retryTimerRef.current) {
        window.clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
    };
  }, [iconFailed, retryTick, panel.iconSource.kind, panel.web?.url]);

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
            : 'bg-transparent'
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
            key={`${panel.id}-${retryTick}`}
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
