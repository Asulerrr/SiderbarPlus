import { useCallback, useEffect, useRef, useState } from 'react';
import type { PanelDescriptor } from '@shared/types';
import { DockItem } from './DockItem';

const ITEM_HEIGHT = 40; // 36px 热区 + 4px 间距
const DRAG_HOLD_MS = 300;
const SCROLL_STEP = 40;
const SCROLL_ZONE = 40;
const SCROLL_SPEED = 5;

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
  const [dragTranslateY, setDragTranslateY] = useState(0);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  const pressedPanelIdRef = useRef<string | null>(null);
  const dragStartedRef = useRef(false);
  const dragSourceIndexRef = useRef(-1);
  const dragAnchorYRef = useRef(0);
  const cursorScrollYRef = useRef(0);
  const lastScrollTopRef = useRef(0);
  const autoScrollRef = useRef<number | null>(null);
  const didReorderRef = useRef(false);
  // 松手首帧抑制所有 transition，防止图标从旧 transform + 新 DOM 位置产生动画跳变
  const suppressTransitionRef = useRef(false);

  useEffect(() => {
    if (!draggingPanelId) {
      if (!didReorderRef.current) {
        setOrderedPanels(panels);
      }
      didReorderRef.current = false;
    }
  }, [panels, draggingPanelId]);

  const clearHoldTimer = (): void => {
    if (holdTimerRef.current) {
      window.clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  };

  const stopAutoScroll = (): void => {
    if (autoScrollRef.current) {
      window.cancelAnimationFrame(autoScrollRef.current);
      autoScrollRef.current = null;
    }
  };

  const finishDrag = useCallback(
    (commitReorder: boolean): void => {
      clearHoldTimer();
      stopAutoScroll();
      pressedPanelIdRef.current = null;
      dragStartedRef.current = false;

      if (!draggingPanelId) {
        onDragStateChange(false);
        return;
      }

      const sourceIndex = dragSourceIndexRef.current;
      const draggedDistance = cursorScrollYRef.current - dragAnchorYRef.current;
      const rawTarget = sourceIndex + Math.round(draggedDistance / ITEM_HEIGHT);
      const clampedTarget = Math.max(0, Math.min(orderedPanels.length - 1, rawTarget));

      // 首帧禁掉所有 CSS transition，防止浏览器从旧 transform + 新 DOM 位置插值产生跳变
      suppressTransitionRef.current = true;

      if (commitReorder && clampedTarget !== sourceIndex) {
        const next = [...orderedPanels];
        const [moved] = next.splice(sourceIndex, 1);
        next.splice(clampedTarget, 0, moved);
        setOrderedPanels(next);
        didReorderRef.current = true;
        onReorder(next.map((p) => p.id));
      }

      setDraggingPanelId(null);
      setDragTranslateY(0);
      dragSourceIndexRef.current = -1;
      dragAnchorYRef.current = 0;
      cursorScrollYRef.current = 0;
      onDragStateChange(false);

      // 下帧恢复 transition
      requestAnimationFrame(() => {
        suppressTransitionRef.current = false;
      });
    },
    [draggingPanelId, orderedPanels, onDragStateChange, onReorder]
  );

  // Pointer events for drag
  useEffect(() => {
    if (!draggingPanelId) return;

    const handlePointerMove = (event: PointerEvent): void => {
      if (!containerRef.current) return;

      const container = containerRef.current;
      const containerRect = container.getBoundingClientRect();
      const scrollTop = container.scrollTop;

      const scrollDelta = scrollTop - lastScrollTopRef.current;
      if (scrollDelta !== 0) {
        dragAnchorYRef.current += scrollDelta;
        lastScrollTopRef.current = scrollTop;
      }

      const cursorScrollY = event.clientY - containerRect.top + scrollTop;
      cursorScrollYRef.current = cursorScrollY;
      const offset = cursorScrollY - dragAnchorYRef.current;
      setDragTranslateY(offset);

      const viewportY = event.clientY - containerRect.top;
      if (viewportY < SCROLL_ZONE && scrollTop > 0) {
        if (!autoScrollRef.current) {
          const scroll = (): void => {
            if (!containerRef.current) return;
            containerRef.current.scrollTop = Math.max(0, containerRef.current.scrollTop - SCROLL_SPEED);
            autoScrollRef.current = requestAnimationFrame(scroll);
          };
          autoScrollRef.current = requestAnimationFrame(scroll);
        }
      } else if (
        viewportY > containerRect.height - SCROLL_ZONE &&
        scrollTop < container.scrollHeight - container.clientHeight
      ) {
        if (!autoScrollRef.current) {
          const scroll = (): void => {
            if (!containerRef.current) return;
            containerRef.current.scrollTop = Math.min(
              containerRef.current.scrollHeight - containerRef.current.clientHeight,
              containerRef.current.scrollTop + SCROLL_SPEED
            );
            autoScrollRef.current = requestAnimationFrame(scroll);
          };
          autoScrollRef.current = requestAnimationFrame(scroll);
        }
      } else {
        stopAutoScroll();
      }
    };

    const handlePointerUp = (): void => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      finishDrag(true);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
      stopAutoScroll();
    };
  }, [draggingPanelId, finishDrag]);

  const handlePointerDown = (event: React.PointerEvent<HTMLButtonElement>, panelId: string): void => {
    if (event.button !== 0) return;

    event.preventDefault();

    const index = orderedPanels.findIndex((p) => p.id === panelId);
    if (index === -1) return;

    const button = event.currentTarget as HTMLElement;
    const wrapper = button.parentElement?.parentElement;
    const container = containerRef.current;
    if (!wrapper || !container) return;

    const wrapperRect = wrapper.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();
    const scrollTop = container.scrollTop;

    const itemCenterScrollY = wrapperRect.top - containerRect.top + scrollTop + wrapperRect.height / 2;
    const cursorScrollY = event.clientY - containerRect.top + scrollTop;

    pressedPanelIdRef.current = panelId;
    dragSourceIndexRef.current = index;
    dragAnchorYRef.current = itemCenterScrollY;
    cursorScrollYRef.current = cursorScrollY;
    lastScrollTopRef.current = scrollTop;
    setDragTranslateY(0);

    clearHoldTimer();

    const onEarlyUp = (): void => {
      clearHoldTimer();
      pressedPanelIdRef.current = null;
      window.removeEventListener('pointerup', onEarlyUp);
    };
    window.addEventListener('pointerup', onEarlyUp);

    holdTimerRef.current = window.setTimeout(() => {
      window.removeEventListener('pointerup', onEarlyUp);
      if (pressedPanelIdRef.current !== panelId) return;

      dragStartedRef.current = true;
      setDraggingPanelId(panelId);
      onDragStateChange(true);
    }, DRAG_HOLD_MS);
  };

  const handleItemHover = useCallback((panelId: string): void => {
    if (dragStartedRef.current || pressedPanelIdRef.current) return;
    onHover(panelId);
  }, [onHover]);

  const handleItemActivate = useCallback((panelId: string): void => {
    if (dragStartedRef.current || pressedPanelIdRef.current) return;
    onActivate(panelId);
  }, [onActivate]);

  // ---- per-item transform ----
  const getItemShift = (visualIndex: number): string => {
    if (!draggingPanelId) return '';

    const sourceIndex = dragSourceIndexRef.current;
    const draggedDistance = cursorScrollYRef.current - dragAnchorYRef.current;
    const targetIndex = Math.max(
      0,
      Math.min(
        orderedPanels.length - 1,
        sourceIndex + Math.round(draggedDistance / ITEM_HEIGHT)
      )
    );

    const panelId = orderedPanels[visualIndex]?.id;

    if (panelId === draggingPanelId) {
      return `translateY(${dragTranslateY}px)`;
    }

    if (sourceIndex < targetIndex) {
      if (visualIndex > sourceIndex && visualIndex <= targetIndex) {
        return `translateY(-${ITEM_HEIGHT}px)`;
      }
    } else if (sourceIndex > targetIndex) {
      if (visualIndex >= targetIndex && visualIndex < sourceIndex) {
        return `translateY(${ITEM_HEIGHT}px)`;
      }
    }

    return '';
  };

  const isDraggedItem = (panelId: string): boolean =>
    draggingPanelId === panelId;
  // 拖拽中 or 松手首帧：禁止 transition
  const noTransition = (): boolean =>
    !!draggingPanelId || suppressTransitionRef.current;

  return (
    <div
      ref={containerRef}
      className={`hide-scrollbar flex h-full flex-col gap-y-[4px] overflow-y-auto pt-1 pb-[24px] ${
        edge === 'right' ? 'pl-[3px] pr-[5px]' : 'pl-[5px] pr-[3px]'
      }`}
      onWheel={(event) => {
        if (!containerRef.current) return;
        event.preventDefault();
        const direction = event.deltaY >= 0 ? 1 : -1;
        containerRef.current.scrollTo({
          top: containerRef.current.scrollTop + direction * SCROLL_STEP,
          behavior: 'smooth'
        });
      }}
    >
      {orderedPanels.map((panel, idx) => (
        <div
          key={panel.id}
          className="shrink-0"
          style={{
            transform: getItemShift(idx),
            transition: noTransition()
              ? 'none'
              : 'transform 180ms cubic-bezier(0.2, 0, 0, 1)',
            zIndex: isDraggedItem(panel.id) ? 10 : 0,
            position: 'relative'
          }}
        >
          <div
            style={{
              opacity: isDraggedItem(panel.id) ? 0.85 : 1,
              transition: 'opacity 120ms ease'
            }}
          >
            <DockItem
              panel={panel}
              active={panel.id === activePanelId}
              highlighted={panel.id === highlightedPanelId}
              dragging={isDraggedItem(panel.id)}
              edge={edge}
              onPointerDown={handlePointerDown}
              onHover={handleItemHover}
              onActivate={handleItemActivate}
              onContextMenu={onContextMenu}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
