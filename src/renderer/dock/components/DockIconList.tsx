import { useEffect, useRef, useState } from 'react';
import type { PanelDescriptor } from '@shared/types';
import { DockItem } from './DockItem';

const ITEM_HEIGHT = 44;
const DRAG_HOLD_MS = 250;
const SCROLL_STEP = 44;

interface DockIconListProps {
  panels: PanelDescriptor[];
  activePanelId: string | null;
  highlightedPanelId: string | null;
  edge: 'left' | 'right';
  onDragStateChange: (dragging: boolean) => void;
  onReorder: (panelIds: string[]) => void;
  onHover: (id: string) => void;
  onActivate: (id: string) => void;
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>, panel: PanelDescriptor) => void;
}

export function DockIconList({
  panels,
  activePanelId,
  highlightedPanelId,
  edge,
  onDragStateChange,
  onReorder,
  onHover,
  onActivate,
  onContextMenu
}: DockIconListProps): JSX.Element {
  const [orderedPanels, setOrderedPanels] = useState(panels);
  const [draggingPanelId, setDraggingPanelId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const pressedPanelIdRef = useRef<string | null>(null);
  const currentOrderRef = useRef(panels);

  useEffect(() => {
    setOrderedPanels(panels);
    currentOrderRef.current = panels;
  }, [panels]);

  useEffect(() => {
    currentOrderRef.current = orderedPanels;
  }, [orderedPanels]);

  const clearHoldTimer = (): void => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const finishDrag = (): void => {
    clearHoldTimer();
    pressedPanelIdRef.current = null;

    if (!draggingPanelId) {
      onDragStateChange(false);
      return;
    }

    const nextOrder = currentOrderRef.current.map((panel) => panel.id);
    const previousOrder = panels.map((panel) => panel.id);
    if (nextOrder.join('|') !== previousOrder.join('|')) {
      onReorder(nextOrder);
    }

    setDraggingPanelId(null);
    onDragStateChange(false);
  };

  useEffect(() => {
    if (!draggingPanelId && !pressedPanelIdRef.current) {
      return;
    }

    const handlePointerMove = (event: PointerEvent): void => {
      if (!pressedPanelIdRef.current) {
        return;
      }

      if (!draggingPanelId || !containerRef.current) {
        return;
      }

      const container = containerRef.current;
      const rect = container.getBoundingClientRect();
      const relativeY = event.clientY - rect.top + container.scrollTop;
      const targetIndex = Math.max(
        0,
        Math.min(currentOrderRef.current.length - 1, Math.floor(relativeY / ITEM_HEIGHT))
      );
      const sourceIndex = currentOrderRef.current.findIndex((panel) => panel.id === draggingPanelId);

      if (sourceIndex === -1 || sourceIndex === targetIndex) {
        return;
      }

      const nextPanels = [...currentOrderRef.current];
      const [movedPanel] = nextPanels.splice(sourceIndex, 1);
      nextPanels.splice(targetIndex, 0, movedPanel);
      setOrderedPanels(nextPanels);
    };

    const handlePointerUp = (): void => {
      finishDrag();
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };
  }, [draggingPanelId, onDragStateChange, onReorder, panels]);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>, panelId: string): void => {
    if (event.button !== 0) {
      return;
    }

    pressedPanelIdRef.current = panelId;
    clearHoldTimer();
    holdTimerRef.current = window.setTimeout(() => {
      if (pressedPanelIdRef.current !== panelId) {
        return;
      }

      setDraggingPanelId(panelId);
      onDragStateChange(true);
    }, DRAG_HOLD_MS);
  };

  const handleItemHover = (panelId: string): void => {
    if (draggingPanelId) {
      return;
    }

    onHover(panelId);
  };

  const handleItemActivate = (panelId: string): void => {
    if (draggingPanelId || pressedPanelIdRef.current) {
      return;
    }

    onActivate(panelId);
  };

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div
        ref={containerRef}
        className="hide-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto py-1"
        onWheel={(event) => {
          if (!containerRef.current) {
            return;
          }

          event.preventDefault();
          const direction = event.deltaY >= 0 ? 1 : -1;
          containerRef.current.scrollTo({
            top: containerRef.current.scrollTop + direction * SCROLL_STEP,
            behavior: 'smooth'
          });
        }}
      >
        {orderedPanels.map((panel) => (
          <DockItem
            key={panel.id}
            panel={panel}
            active={panel.id === activePanelId}
            highlighted={panel.id === highlightedPanelId}
            dragging={panel.id === draggingPanelId}
            edge={edge}
            onPointerDown={handlePointerDown}
            onHover={handleItemHover}
            onActivate={handleItemActivate}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>
    </div>
  );
}
