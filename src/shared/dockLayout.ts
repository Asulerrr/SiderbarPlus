import type { Edge } from './types';

export const getDockActiveIndicatorSide = (edge: Edge): 'left' | 'right' =>
  edge === 'right' ? 'right' : 'left';

export const shouldShowDockActiveIndicator = ({
  activePanelId,
  panelVisible
}: {
  activePanelId: string | null;
  panelVisible: boolean;
}): boolean => Boolean(activePanelId && panelVisible);
