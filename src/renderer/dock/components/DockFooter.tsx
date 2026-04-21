import { MoreVertical, Plus, X } from 'lucide-react';

interface DockFooterProps {
  menuOpen: boolean;
  onShowAddSite: () => void;
  onToggleMenu: () => void;
  onHideDock: () => void;
}

const buttonClassName =
  'flex h-11 w-11 items-center justify-center text-white/78 transition-colors hover:bg-white/8 hover:text-white';

export function DockFooter({
  menuOpen,
  onShowAddSite,
  onToggleMenu,
  onHideDock
}: DockFooterProps): JSX.Element {
  return (
    <div className="flex flex-col items-center pb-2">
      <button
        type="button"
        className={buttonClassName}
        title="添加网页"
        onMouseEnter={onShowAddSite}
        onClick={onShowAddSite}
      >
        <Plus size={18} strokeWidth={2.1} />
      </button>
      <button
        type="button"
        className={`${buttonClassName} ${menuOpen ? 'bg-white/8 text-white' : ''}`}
        title="更多"
        onClick={onToggleMenu}
      >
        <MoreVertical size={18} strokeWidth={2.1} />
      </button>
      <button type="button" className={buttonClassName} title="隐藏侧边栏" onClick={onHideDock}>
        <X size={18} strokeWidth={2.1} />
      </button>
    </div>
  );
}
