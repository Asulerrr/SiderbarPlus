import { useState } from 'react';

interface DataColors {
  text: string;
  mutedText: string;
  subtleBorder: string;
}

interface DataProps {
  colors: DataColors;
  onToast: (message: string, type: 'success' | 'error' | 'info') => void;
}

export function Data({ colors, onToast }: DataProps): JSX.Element {
  const [confirming, setConfirming] = useState(false);
  const { text, mutedText, subtleBorder } = colors;

  const rowClass =
    'group flex w-full items-center justify-between border-b py-3.5 text-left transition-colors';
  const labelClass = 'text-[13px] tracking-cn transition-colors';
  const arrowClass =
    'font-mono text-[11px] transition-all group-hover:translate-x-0.5 text-accent';

  return (
    <div>
      <button
        type="button"
        onClick={() => void window.panelAPI.openConfigFolder()}
        className={rowClass}
        style={{ borderColor: subtleBorder }}
      >
        <span className={labelClass} style={{ color: text }}>打开配置文件夹</span>
        <span className={arrowClass}>→</span>
      </button>
      <button
        type="button"
        onClick={async () => {
          const result = await window.panelAPI.exportConfig();
          if (result.ok && !result.data.canceled) {
            onToast(`已导出到：${result.data.path}`, 'success');
          }
        }}
        className={rowClass}
        style={{ borderColor: subtleBorder }}
      >
        <span className={labelClass} style={{ color: text }}>导出配置</span>
        <span className={arrowClass}>↓</span>
      </button>
      <button
        type="button"
        onClick={async () => {
          const result = await window.panelAPI.importConfig();
          if (!result.ok) {
            onToast(`导入失败：${result.error}`, 'error');
          }
        }}
        className={rowClass}
        style={{ borderColor: subtleBorder }}
      >
        <span className={labelClass} style={{ color: text }}>导入配置</span>
        <span className={arrowClass}>↑</span>
      </button>

      <div className="mt-6">
        <div className="mb-3 font-mono text-[10px] tracking-[0.18em]" style={{ color: mutedText, opacity: 0.55 }}>
          DANGER ZONE
        </div>
        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            className="group flex w-full items-center justify-between border border-[#6b3333]/60 bg-[#1a0e0e] px-4 py-3 text-left transition-colors hover:border-[#a04848] hover:bg-[#241010]"
          >
            <span className="text-[13px] tracking-cn text-[#ff9d9d]">
              清除所有 Cookie 和缓存
            </span>
            <span className="font-mono text-[11px] text-[#ff9d9d]/50 group-hover:text-[#ff9d9d]">
              ✕
            </span>
          </button>
        ) : (
          <div className="border border-[#a04848] bg-[#1a0e0e] p-4">
            <div className="mb-3 flex items-baseline gap-2">
              <span className="font-mono text-[10px] tracking-wider text-[#ff9d9d]">
                CONFIRM
              </span>
              <span className="text-[12px] tracking-cn text-[#ff9d9d]">
                此操作不可撤销
              </span>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={async () => {
                  await window.panelAPI.clearStorageData();
                  setConfirming(false);
                  onToast('已清除', 'success');
                }}
                className="bg-[#a04848] px-4 py-2 text-[12px] font-semibold tracking-cn text-white transition-colors hover:bg-[#b85555]"
              >
                确认清除
              </button>
              <button
                type="button"
                onClick={() => setConfirming(false)}
                className="border px-4 py-2 text-[12px] tracking-cn transition-colors hover:border-white/30"
                style={{ borderColor: subtleBorder, color: mutedText }}
              >
                取消
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
