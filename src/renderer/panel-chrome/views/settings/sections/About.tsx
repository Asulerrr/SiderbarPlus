import { useState } from 'react';
import { APP_NAME, APP_VERSION } from '@shared/constants';

type CheckState =
  | { kind: 'idle' }
  | { kind: 'checking' }
  | { kind: 'up-to-date'; current: string }
  | { kind: 'available'; latest: string; url?: string }
  | { kind: 'no-remote' }
  | { kind: 'error'; message: string };

export function About({ textColor }: { textColor: string }): JSX.Element {
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

  const s = (o: number) => ({ color: textColor, opacity: o });

  return (
    <div className="space-y-6">
      <div>
        <div className="font-display text-[22px] font-semibold tracking-cn" style={s(1)}>
          {APP_NAME}
        </div>
        <div className="mt-1.5 flex items-baseline gap-3">
          <span className="font-mono text-[10px] tracking-[0.18em]" style={s(0.35)}>VERSION</span>
          <span className="font-mono text-[13px] tracking-wider text-accent">{APP_VERSION}</span>
        </div>
      </div>

      <div>
        <button
          type="button"
          onClick={() => void onCheck()}
          disabled={state.kind === 'checking'}
          className="group inline-flex items-center gap-2 rounded-md border border-accent/50 bg-accent/10 px-5 py-2.5 text-[12px] font-semibold tracking-cn text-accent transition-colors hover:bg-accent hover:text-[#0A0A0A] disabled:cursor-not-allowed disabled:opacity-30"
        >
          <span>{state.kind === 'checking' ? '检查中…' : '检查更新'}</span>
          <span className="font-mono text-[10px] transition-transform group-hover:translate-x-0.5">→</span>
        </button>
        <div className="mt-3 min-h-[20px] text-[12px] tracking-cn" style={s(0.65)}>
          {state.kind === 'up-to-date' && (
            <span>已是最新版本 <span className="font-mono text-accent">{state.current}</span></span>
          )}
          {state.kind === 'available' && (
            <span>
              发现新版本 <span className="font-mono text-accent">{state.latest}</span>
              {state.url && <> · <a className="border-b border-accent/40 text-accent hover:border-accent" href={state.url} target="_blank" rel="noreferrer">查看发布页</a></>}
            </span>
          )}
          {state.kind === 'no-remote' && <span style={s(0.45)}>未配置更新源</span>}
          {state.kind === 'error' && <span className="text-[#ff9d9d]">检查失败：{state.message}</span>}
        </div>
      </div>
    </div>
  );
}
