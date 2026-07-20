import {
  ExternalLink,
  Minus,
  MoreHorizontal,
  Pin,
  PinOff,
  X
} from 'lucide-react';
import { useRef } from 'react';

interface ChromeToolbarProps {
  panelId: string | null;
  panelType: 'web' | 'builtin';
  panelMode: 'hover' | 'pinned';
  edge: 'left' | 'right';
}

export function ChromeToolbar({
  panelId,
  panelType,
  panelMode,
  edge
}: ChromeToolbarProps): JSX.Element {
  const menuButtonRef = useRef<HTMLButtonElement | null>(null);

  const webOnly = panelType === 'web' ? '' : 'pointer-events-none opacity-35';

  return (
    <div className="relative flex shrink-0 items-center">
      <button
        type="button"
        title="在浏览器中打开"
        className={`flex h-8 w-8 items-center justify-center rounded text-white/72 hover:bg-white/30 ${webOnly}`}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => {
          if (panelId && panelType === 'web') {
            void window.panelAPI.openExternal({ panelId });
          }
        }}
      >
        <ExternalLink size={14} />
      </button>
      <button
        ref={menuButtonRef}
        type="button"
        title="更多"
        className={`flex h-8 w-8 items-center justify-center rounded text-white/72 hover:bg-white/30 ${webOnly}`}
        onMouseDown={(event) => event.stopPropagation()}
        onClick={() => {
          if (!panelId || !menuButtonRef.current || panelType !== 'web') return;
          const rect = menuButtonRef.current.getBoundingClientRect();
          void window.panelAPI.openMenu({
            panelId,
            edge,
            x: rect.right,
            y: rect.bottom + 6
          });
        }}
      >
        <MoreHorizontal size={14} />
      </button>
      <button
        type="button"
        className={`flex h-8 w-8 items-center justify-center rounded hover:bg-white/30 ${
          panelMode === 'pinned' ? 'text-accent bg-accent/15' : 'text-white/72'
        }`}
        title={panelMode === 'pinned' ? '已固定 — 点击取消（Alt+`）' : '未固定 — 点击固定（Alt+`）'}
        onClick={() => void window.panelAPI.togglePin()}
      >
        {panelMode === 'pinned' ? <Pin size={14} /> : <PinOff size={14} />}
      </button>
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded text-white/72 hover:bg-white/30"
        onClick={() => void window.panelAPI.minimizePanel()}
      >
        <Minus size={14} />
      </button>
      <button
        type="button"
        className="flex h-8 w-8 items-center justify-center rounded text-white/72 hover:bg-white/30"
        onClick={() => void window.panelAPI.closePanel()}
      >
        <X size={14} />
      </button>
    </div>
  );
}
