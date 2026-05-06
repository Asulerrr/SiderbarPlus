import { EllipsisVertical, Plus, X } from 'lucide-react';
import { useState } from 'react';

interface DockFooterProps {
  onShowAddSite: () => void;
  onOpenQuickMenu: () => void;
  onHideDock: () => void;
  edge: 'left' | 'right';
  fgColor: string;
  separatorColor: string;
}

const buttons = [
  { icon: Plus, label: '添加网页', id: 'add' },
  { icon: EllipsisVertical, label: '更多', id: 'menu' },
  { icon: X, label: '隐藏侧边栏', id: 'hide' }
] as const;

export function DockFooter({
  onShowAddSite,
  onOpenQuickMenu,
  onHideDock,
  edge,
  fgColor,
  separatorColor
}: DockFooterProps): JSX.Element {
  const [hovered, setHovered] = useState<string | null>(null);
  const [clicked, setClicked] = useState<string | null>(null);

  const handleClick = (id: string, onClick: () => void): void => {
    setClicked(id);
    setHovered(null);
    onClick();
    setTimeout(() => setClicked(null), 200);
  };

  return (
    <div className={`flex w-full flex-col items-center gap-0 pb-0.5 pt-0 ${
      edge === 'right' ? 'pl-1.5' : 'pr-1.5'
    }`}>
      <div className="mb-3 mt-0.5 h-px w-6" style={{ backgroundColor: separatorColor }} />
      <div className="-mt-1 flex w-full flex-col items-center gap-0">
        {buttons.map(({ icon: Icon, label, id }) => (
          <button
            key={id}
            type="button"
            className={`flex h-[32px] w-[30px] items-center justify-center rounded-lg transition-colors mx-auto ${
              hovered === id && clicked !== id ? 'bg-white/20' :
              clicked === id ? 'bg-white/20' :
              'bg-transparent'
            }`}
            style={{ color: fgColor + '8F' }}
            title={label}
            onMouseEnter={() => clicked !== id && setHovered(id)}
            onMouseLeave={() => { setHovered(null); setClicked(null); }}
            onClick={() =>
              handleClick(id,
                id === 'add' ? onShowAddSite :
                id === 'menu' ? onOpenQuickMenu :
                onHideDock
              )
            }
          >
            <Icon size={16} strokeWidth={1.5} aria-hidden="true" />
          </button>
        ))}
      </div>
    </div>
  );
}
