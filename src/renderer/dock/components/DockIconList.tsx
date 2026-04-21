import type { PanelDescriptor } from '@shared/types';
import { DockItem } from './DockItem';

interface DockIconListProps {
  panels: PanelDescriptor[];
  activePanelId: string | null;
  edge: 'left' | 'right';
  onHover: (id: string) => void;
  onActivate: (id: string) => void;
  onContextMenu: (event: React.MouseEvent<HTMLButtonElement>, panel: PanelDescriptor) => void;
}

export function DockIconList({
  panels,
  activePanelId,
  edge,
  onHover,
  onActivate,
  onContextMenu
}: DockIconListProps): JSX.Element {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="hide-scrollbar flex min-h-0 flex-1 flex-col overflow-y-auto py-1">
        {panels.map((panel) => (
          <DockItem
            key={panel.id}
            panel={panel}
            active={panel.id === activePanelId}
            edge={edge}
            onHover={onHover}
            onActivate={onActivate}
            onContextMenu={onContextMenu}
          />
        ))}
      </div>
    </div>
  );
}
