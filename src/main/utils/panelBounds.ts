import type { Edge } from '../../shared/types';

export interface WindowBounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

export const getPreferredPanelWidth = (
  preferredWidth: number | undefined,
  fallbackWidth: number
): number => {
  if (typeof preferredWidth !== 'number' || !Number.isFinite(preferredWidth) || preferredWidth <= 0) {
    return fallbackWidth;
  }

  return Math.round(preferredWidth);
};

export const getPanelBounds = (
  edge: Edge,
  dockBounds: WindowBounds,
  panelWidth: number
): WindowBounds => ({
  x: edge === 'right' ? dockBounds.x - panelWidth : dockBounds.x + dockBounds.width,
  y: dockBounds.y,
  width: panelWidth,
  height: dockBounds.height
});
