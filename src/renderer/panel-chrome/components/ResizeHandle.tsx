import React, { useRef } from 'react';
import type { Edge } from '@shared/types';

interface Props {
  edge: Edge;
}

const MIN_WIDTH = 320;

const clampToScreen = (width: number): number => {
  const max = Math.floor(window.screen.availWidth * 0.5);
  return Math.min(Math.max(Math.round(width), MIN_WIDTH), max);
};

export const ResizeHandle: React.FC<Props> = ({ edge }) => {
  const activeRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const pendingWidthRef = useRef<number | null>(null);

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
    const startWidth = window.innerWidth; // M5 架构下窗口宽 = chrome 宽

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
      ? { left: 0, top: 0, bottom: 0, width: 4 }
      : { right: 0, top: 0, bottom: 0, width: 4 };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      style={{ position: 'absolute', cursor: 'ew-resize', zIndex: 50, ...positionStyle }}
    />
  );
};
