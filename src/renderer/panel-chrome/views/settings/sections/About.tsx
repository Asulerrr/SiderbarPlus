import { useState } from 'react';
import { APP_NAME, APP_VERSION } from '@shared/constants';

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date'; current: string }
  | { kind: 'available'; latest: string; url?: string }
  | { kind: 'no-remote' }
  | { kind: 'error'; message: string };

export function About(): JSX.Element {
  const [state, setState] = useState<CheckState>({ kind: 'idle' });

  const onCheck = async (): Promise<void> => {
    setState({ kind: 'checking' });
    const result = await window.panelAPI.checkUpdate();
    if (!result.ok) {
      setState({ kind: 'error', message: result.error });
      return;
    }
    const data = result.data;
    if (data.status === 'available' && data.latest) {
      setState({ kind: 'available', latest: data.latest, url: data.url });
    } else if (data.status === 'up-to-date') {
      setState({ kind: 'up-to-date', current: data.current });
    } else if (data.status === 'no-remote') {
      setState({ kind: 'no-remote' });
    } else {
      setState({ kind: 'error', message: data.error ?? '未知错误' });
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="font-display text-[22px] font-semibold tracking-cn text-white">
          {APP_NAME}
        </div>
        <div className="mt-1.5 flex items-baseline gap-3">
          <span className="font-mono text-[10px] tracking-[0.18em] text-white/35">
            VERSION
          </span>
          <span className="font-mono text-[13px] tracking-wider text-amber">
            {APP_VERSION}
          </span>
        </div>
      </div>

      <p className="border-l-2 border-white/10 pl-4 text-[13px] leading-relaxed tracking-cn text-white/65">
        独立桌面侧边栏，对标 Edge Bar；完全不透明、左/右贴边、Win10/11 全兼容。
      </p>

      <div>
        <div className="mb-3 font-mono text-[10px] tracking-[0.18em] text-white/35">
          UPDATES
        </div>
        <button
          type="button"
          onClick={() => void onCheck()}
          disabled={state.kind === 'checking'}
          className="group inline-flex items-center gap-2 border border-amber/45 bg-transparent px-5 py-2.5 text-[12px] font-semibold tracking-cn text-amber transition-colors hover:bg-amber hover:text-black disabled:cursor-not-allowed disabled:border-white/15 disabled:text-white/35 disabled:hover:bg-transparent"
        >
          <span>{state.kind === 'checking' ? '检查中…' : '检查更新'}</span>
          <span className="font-mono text-[10px] transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </button>
        <div className="mt-3 min-h-[20px] text-[12px] tracking-cn text-white/65">
          {state.kind === 'up-to-date' && (
            <span>
              已是最新版本{' '}
              <span className="font-mono text-amber">{state.current}</span>
            </span>
          )}
          {state.kind === 'available' && (
            <span>
              发现新版本{' '}
              <span className="font-mono text-amber">{state.latest}</span>
              {state.url && (
                <>
                  {' '}
                  ·{' '}
                  <a
                    className="border-b border-amber/40 text-amber hover:border-amber"
                    href={state.url}
                    target="_blank"
                    rel="noreferrer"
                  >
                    查看发布页
                  </a>
                </>
              )}
            </span>
          )}
          {state.kind === 'no-remote' && (
            <span className="text-white/45">未配置更新源</span>
          )}
          {state.kind === 'error' && (
            <span className="text-[#ff9d9d]">检查失败：{state.message}</span>
          )}
        </div>
      </div>
    </div>
  );
}
