import { screen, type Display } from 'electron';
import type { Edge } from '../../shared/types';
import { DOCK_WIDTH } from '../../shared/constants';

export interface DockBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 持久化的 displayId 在多屏插拔后可能失效，统一用 getTargetDisplay 兜底主屏。 */
export const getTargetDisplay = (displayId?: number): Display => {
  if (typeof displayId === 'number') {
    const found = screen.getAllDisplays().find((d) => d.id === displayId);
    if (found) {
      return found;
    }
  }
  return screen.getPrimaryDisplay();
};

export const getDockBounds = (edge: Edge, displayId?: number): DockBounds => {
  const { workArea } = getTargetDisplay(displayId);

  return {
    x: edge === 'right' ? workArea.x + workArea.width - DOCK_WIDTH : workArea.x,
    y: workArea.y,
    width: DOCK_WIDTH,
    height: workArea.height
  };
};
