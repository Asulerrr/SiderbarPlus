import { Info, Settings } from 'lucide-react';

interface QuickMenuProps {
  edge: 'left' | 'right';
  autoLaunch: boolean;
  onToggleAutoLaunch: () => void;
  onOpenSettings: () => void;
  onOpenAbout: () => void;
}

export function QuickMenu({
  edge,
  autoLaunch,
  onToggleAutoLaunch,
  onOpenSettings,
  onOpenAbout
}: QuickMenuProps): JSX.Element {
  return (
    <div
      className={`absolute bottom-24 z-20 min-w-[188px] rounded-lg border border-white/8 bg-[#2D2D2D] p-1 shadow-[0_4px_16px_rgba(0,0,0,0.3)] ${
        edge === 'right' ? 'right-[52px]' : 'left-[52px]'
      }`}
    >
      <button
        type="button"
        onClick={onToggleAutoLaunch}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/8"
      >
        <span className="w-4 text-center">{autoLaunch ? '✓' : ''}</span>
        <span>自动启动 Sidebar Plus</span>
      </button>

      <div className="my-1 h-px bg-white/8" />

      <button
        type="button"
        onClick={onOpenSettings}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/8"
      >
        <Settings size={14} />
        <span>设置</span>
      </button>
      <button
        type="button"
        onClick={onOpenAbout}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm text-white transition-colors hover:bg-white/8"
      >
        <Info size={14} />
        <span>关于</span>
      </button>
    </div>
  );
}
