import React, { useEffect, useState } from 'react';
import type { Edge } from '@shared/types';

interface Props {
  edge: Edge;
}

export const ResizeHandle: React.FC<Props> = ({ edge }) => {
  const [isDragging, setIsDragging] = useState(false);

  useEffect(() => {
    const unsubscribe = window.panelAPI.onResizeState((active) => {
      setIsDragging(active);
    });
    return unsubscribe;
  }, []);

  const positionStyle: React.CSSProperties =
    edge === 'right'
      ? { left: 0, top: 0, bottom: 0, width: 8 }
      : { right: 0, top: 0, bottom: 0, width: 8 };

  const lineStyle: React.CSSProperties =
    edge === 'right'
      ? { left: 0 }
      : { right: 0 };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onPointerDown={(event) => {
        if (!event.isPrimary || event.button !== 0) return;
        event.preventDefault();
        event.stopPropagation();
        window.panelAPI.startResize({ x: event.screenX, y: event.screenY });
      }}
      onMouseDown={(event) => event.stopPropagation()}
      style={{
        position: 'absolute',
        cursor: 'ew-resize',
        pointerEvents: 'auto',
        zIndex: 50,
        ...positionStyle
      }}
    >
      {/* Windows owns edge hit-testing; this line is visual feedback only. */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          bottom: 0,
          width: isDragging ? 2 : 1,
          background: '#4abff6',
          opacity: isDragging ? 1 : 0.15,
          transition: isDragging ? 'none' : 'opacity 0.15s ease, width 0.15s ease',
          pointerEvents: 'none',
          ...lineStyle
        }}
      />
    </div>
  );
};
