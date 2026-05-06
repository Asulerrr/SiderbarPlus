import type { Edge } from './types';

export const getDockActiveIndicatorSide = (edge: Edge): 'left' | 'right' =>
  edge === 'right' ? 'right' : 'left';

export const shouldShowDockActiveIndicator = ({
  activePanelId,
  panelVisible,
  panelMode
}: {
  activePanelId: string | null;
  panelVisible: boolean;
  panelMode: string;
}): boolean => {
  if (panelMode === 'pinned' && activePanelId) return true;
  return Boolean(activePanelId && panelVisible);
};
