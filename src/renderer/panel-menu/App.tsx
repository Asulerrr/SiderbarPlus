import {
  BellOff,
  Check,
  Info,
  Link as LinkIcon,
  Pencil,
  RotateCw,
  Smartphone,
  Trash2
} from 'lucide-react';
import { useEffect, useState } from 'react';
import type { PanelMenuOpenPayload, PanelMenuState } from '@shared/types';

export default function App(): JSX.Element {
  const [payload, setPayload] = useState<PanelMenuOpenPayload | null>(null);
  const [state, setState] = useState<PanelMenuState | null>(null);

  useEffect(() => {
    const disposeHydrate = window.panelMenuAPI.onHydrate((nextPayload) => {
      setPayload(nextPayload);
      setState(nextPayload.state);
    });

    return () => {
      disposeHydrate();
    };
  }, []);

  const handleAction = async (
    action:
      | 'reload'
      | 'copy-link'
      | 'toggle-mobile-view'
      | 'toggle-notifications-snooze'
      | 'open-edit-site'
      | 'clear-site-data'
      | 'open-site-info'
  ): Promise<void> => {
    if (!payload || !state) {
      return;
    }

    if (
      action === 'clear-site-data' &&
      !window.confirm(`清除 ${state.title} 的所有 Cookie 和缓存？`)
    ) {
      return;
    }

    const result = await window.panelMenuAPI.runMenuAction({
      panelId: payload.panelId,
      action
    });

    if (result.ok) {
      setState(result.data);
      if (
        action === 'reload' ||
        action === 'copy-link' ||
        action === 'open-edit-site' ||
        action === 'clear-site-data' ||
        action === 'open-site-info'
      ) {
        await window.panelMenuAPI.closeMenuAndResumeHover();
      }
    }
  };

  return (
    <main
      className="min-h-screen bg-transparent p-0"
      onMouseLeave={() => {
        void window.panelMenuAPI.closeMenu();
      }}
    >
      <div className="rounded-lg border border-white/8 bg-[#2D2D2D] p-1 shadow-[0_10px_30px_rgba(0,0,0,0.35)]">
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-white transition-colors hover:bg-white/30"
          onClick={() => void handleAction('reload')}
        >
          <RotateCw size={14} className="text-white/72" />
          <span>刷新</span>
        </button>
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-white transition-colors hover:bg-white/30"
          onClick={() => void handleAction('copy-link')}
        >
          <LinkIcon size={14} className="text-white/72" />
          <span>复制链接</span>
        </button>
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-white transition-colors hover:bg-white/30"
          onClick={() => void handleAction('toggle-mobile-view')}
        >
          <Smartphone size={14} className="text-white/72" />
          <span className="flex-1">显示移动视图</span>
          {state?.userAgentMode === 'mobile' ? <Check size={14} className="text-white/72" /> : null}
        </button>
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-white transition-colors hover:bg-white/30"
          onClick={() => void handleAction('toggle-notifications-snooze')}
        >
          <BellOff size={14} className="text-white/72" />
          <span className="flex-1">{state?.notificationsSnoozed ? '取消推迟通知' : '推迟通知'}</span>
          {state?.notificationsSnoozed ? <Check size={14} className="text-white/72" /> : null}
        </button>
        <div className="my-1 h-px bg-white/8" />
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-white transition-colors hover:bg-white/30"
          onClick={() => void handleAction('open-edit-site')}
        >
          <Pencil size={14} className="text-white/72" />
          <span>编辑此站点</span>
        </button>
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-white transition-colors hover:bg-white/30"
          onClick={() => void handleAction('clear-site-data')}
        >
          <Trash2 size={14} className="text-white/72" />
          <span>清除此站点数据</span>
        </button>
        <button
          type="button"
          className="flex h-8 w-full items-center gap-2 rounded-md px-3 text-left text-sm text-white transition-colors hover:bg-white/30"
          onClick={() => void handleAction('open-site-info')}
        >
          <Info size={14} className="text-white/72" />
          <span>站点信息</span>
        </button>
      </div>
    </main>
  );
}
