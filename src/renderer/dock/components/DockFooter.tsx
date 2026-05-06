import { EllipsisVertical, Plus, X } from 'lucide-react';

interface DockFooterProps {
  onShowAddSite: () => void;
  onOpenQuickMenu: () => void;
  onHideDock: () => void;
  edge: 'left' | 'right';
  fgColor: string;
  separatorColor: string;
}

export function DockFooter({
  onShowAddSite,
  onOpenQuickMenu,
  onHideDock,
  edge,
  fgColor,
  separatorColor
}: DockFooterProps): JSX.Element {
  return (
    <div className={`flex w-full flex-col items-center gap-0 pb-0.5 pt-0 ${
      edge === 'right' ? 'pl-1.5' : 'pr-1.5'
    }`}>
      <div className="mb-3 mt-0.5 h-px w-6" style={{ backgroundColor: separatorColor }} />
      <div className="-mt-1 flex w-full flex-col items-center gap-0">
        {([
          { icon: Plus, label: '添加网页', onClick: onShowAddSite },
          { icon: EllipsisVertical, label: '更多', onClick: onOpenQuickMenu },
          { icon: X, label: '隐藏侧边栏', onClick: onHideDock }
        ] as const).map(({ icon: Icon, label, onClick }) => (
          <button
            key={label}
            type="button"
            className="flex h-[32px] w-[30px] items-center justify-center rounded-lg transition-colors hover:bg-white/30 mx-auto"
            style={{ color: fgColor + '8F' }}
            title={label}
            onClick={onClick}
          >
            <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
