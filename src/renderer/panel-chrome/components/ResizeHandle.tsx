import React, { useRef, useState } from 'react';
import type { Edge } from '@shared/types';

interface Props {
  edge: Edge;
}

const MIN_WIDTH = 320;

const clampToScreen = (width: number): number => {
  const max = Math.floor(Math.min(window.screen.availWidth, window.screen.width) * 0.8);
  return Math.min(Math.max(Math.round(width), MIN_WIDTH), max);
};

export const ResizeHandle: React.FC<Props> = ({ edge }) => {
  const activeRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingWidthRef = useRef<number | null>(null);
  const [isHovered, setIsHovered] = useState(false);

  const flush = () => {
    rafRef.current = null;
    const w = pendingWidthRef.current;
    pendingWidthRef.current = null;
    if (w != null) window.panelAPI.resizeDrag(w);
  };

  const onMouseDown = (event: React.MouseEvent) => {
    if (activeRef.current) return;
    event.preventDefault();
    activeRef.current = true;

    const startX = event.screenX;
    const startWidth = window.innerWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = edge === 'right' ? startX - ev.screenX : ev.screenX - startX;
      const next = clampToScreen(startWidth + delta);
      pendingWidthRef.current = next;
      if (rafRef.current == null) {
        rafRef.current = window.requestAnimationFrame(flush);
      }
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      if (rafRef.current != null) {
        window.cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      const finalW = pendingWidthRef.current ?? clampToScreen(window.innerWidth);
      pendingWidthRef.current = null;
      activeRef.current = false;
      void window.panelAPI.commitResize(finalW);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const positionStyle: React.CSSProperties =
    edge === 'right'
      ? { left: 0, top: 0, bottom: 0, width: 8 }
      : { right: 0, top: 0, bottom: 0, width: 8 };

  // 发光线贴近面板一侧：面板在右侧时手柄在左边缘，发光线贴右；面板在左侧时反之
  const glowStyle: React.CSSProperties =
    edge === 'right'
      ? { right: 0 }
      : { left: 0 };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => { if (!activeRef.current) setIsHovered(false); }}
      style={{ position: 'absolute', cursor: 'ew-resize', zIndex: 50, ...positionStyle }}
    >
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: 2,
          background: 'linear-gradient(180deg, transparent 0%, #6c63ff 30%, #6c63ff 70%, transparent 100%)',
          opacity: isHovered ? 0.7 : 0,
          transition: 'opacity 0.15s ease',
          pointerEvents: 'none',
          ...glowStyle
        }}
      />
    </div>
  );
};
