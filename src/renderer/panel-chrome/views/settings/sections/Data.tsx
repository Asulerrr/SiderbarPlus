import { useState } from 'react';

export function Data(): JSX.Element {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="space-y-3">
      <h2 className="mb-3 text-base font-medium">数据</h2>
      <button
        type="button"
        onClick={() => void window.panelAPI.openConfigFolder()}
        className="block w-full rounded-md border border-white/15 px-3 py-2 text-left text-sm hover:bg-white/5"
      >
        打开配置文件夹
      </button>
      <button
        type="button"
        onClick={async () => {
          const result = await window.panelAPI.exportConfig();
          if (result.ok && !result.data.canceled) {
            window.alert(`已导出到：${result.data.path}`);
          }
        }}
        className="block w-full rounded-md border border-white/15 px-3 py-2 text-left text-sm hover:bg-white/5"
      >
        导出配置
      </button>
      <button
        type="button"
        onClick={async () => {
          const result = await window.panelAPI.importConfig();
          if (!result.ok) {
            window.alert(`导入失败：${result.error}`);
          }
        }}
        className="block w-full rounded-md border border-white/15 px-3 py-2 text-left text-sm hover:bg-white/5"
      >
        导入配置
      </button>
      {!confirming ? (
        <button
          type="button"
          onClick={() => setConfirming(true)}
          className="block w-full rounded-md border border-red-500/40 px-3 py-2 text-left text-sm text-red-400 hover:bg-red-500/10"
        >
          清除所有 Cookie 和缓存
        </button>
      ) : (
        <div className="rounded-md border border-red-500/40 p-3">
          <div className="mb-2 text-sm text-red-400">确认清除？此操作不可撤销。</div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                await window.panelAPI.clearStorageData();
                setConfirming(false);
                window.alert('已清除');
              }}
              className="rounded-md bg-red-500 px-3 py-1 text-sm text-white hover:bg-red-600"
            >
              确认清除
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="rounded-md border border-white/15 px-3 py-1 text-sm hover:bg-white/5"
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
