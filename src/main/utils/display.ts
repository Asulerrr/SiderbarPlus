import { screen } from 'electron';
import type { Edge } from '../../shared/types';
import { DOCK_WIDTH } from '../../shared/constants';

export interface DockBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const getDockBounds = (edge: Edge): DockBounds => {
  const { workArea } = screen.getPrimaryDisplay();

  return {
    x: edge === 'right' ? workArea.x + workArea.width - DOCK_WIDTH : workArea.x,
    y: workArea.y,
    width: DOCK_WIDTH,
    height: workArea.height
  };
};
