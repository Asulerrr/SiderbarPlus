interface DockFooterProps {
  menuOpen: boolean;
  onShowAddSite: () => void;
  onToggleMenu: () => void;
  onHideDock: () => void;
}

const buttonClassName =
  'flex h-[42px] w-11 items-center justify-center text-[22px] leading-none font-medium text-white/88 transition-colors hover:bg-white/8 hover:text-white';

const edgeButtonClassName =
  'flex h-[42px] w-11 items-center justify-center text-[26px] leading-none font-medium text-white/88 transition-colors hover:bg-white/8 hover:text-white';

export function DockFooter({
  menuOpen,
  onShowAddSite,
  onToggleMenu,
  onHideDock
}: DockFooterProps): JSX.Element {
  return (
    <div className="flex w-full flex-col items-center gap-0 bg-dock px-0 pb-0.5 pt-0">
      <div className="mb-3 mt-0.5 h-px w-8 bg-white/20" />
      <div className="-mt-1 flex w-full flex-col items-center gap-0">
        <button
          type="button"
          className={edgeButtonClassName}
          title="添加网页"
          onMouseEnter={onShowAddSite}
          onClick={onShowAddSite}
        >
          <span aria-hidden="true">+</span>
        </button>
        <button
          type="button"
          className={`${buttonClassName} ${menuOpen ? 'bg-white/8 text-white' : ''}`}
          title="更多"
          onClick={onToggleMenu}
        >
          <span aria-hidden="true">⋮</span>
        </button>
        <button
          type="button"
          className={edgeButtonClassName}
          title="隐藏侧边栏"
          onClick={onHideDock}
        >
          <span aria-hidden="true">×</span>
        </button>
      </div>
    </div>
  );
}
