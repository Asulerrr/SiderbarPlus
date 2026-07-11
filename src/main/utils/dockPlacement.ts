import type { AppConfig } from '../../shared/types';

type DockPlacement = Pick<AppConfig['layout'], 'edge' | 'displayId'>;

export const didDockPlacementChange = (
  before: DockPlacement,
  after: DockPlacement
): boolean =>
  before.edge !== after.edge || before.displayId !== after.displayId;
