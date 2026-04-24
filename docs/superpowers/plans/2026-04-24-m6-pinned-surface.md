# M6 Pinned Surface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 实现 PRD §5.7 固定模式：📌 切换 / 固定态常驻 / 切图标不退出 / 边缘拖拽改宽。

**Architecture:** `panelMode: 'hover' | 'pinned'` 纯内存态放在 `PanelManager`，取代已持久化的 `config.layout.pinned`（删字段）。UI 侧 `panel-chrome` 新增 📌 切换按钮与 `ResizeHandle` 组件；主进程新增 `panel:toggle-pin` / `panel:commit-resize` 两条 IPC，严格遵循 PRD §5.14 "mousemove 只改 CSS、mouseup 一次 setBounds" 铁律。

**Tech Stack:** Electron 30+, React 18, TypeScript, Tailwind, Node 20 builtin test runner

**Spec:** `docs/superpowers/specs/2026-04-24-m6-design.md`

---

## File Structure

**Create:**
- `src/renderer/panel-chrome/components/ResizeHandle.tsx` — 固定态下渲染的 4px 拖拽条
- `src/main/store/migrations/dropLegacyPinned.ts` — migration 丢弃老 `layout.pinned` 字段
- `src/main/panels/__tests__/commitResize.test.ts` — commitResize clamp 测试
- `src/main/store/migrations/__tests__/dropLegacyPinned.test.ts` — migration 测试

**Modify:**
- `src/shared/types.ts` — 删 `AppConfig.layout.pinned` / 改 `PanelState.pinned` → `panelMode`
- `src/shared/constants.ts` — 默认 config 删 `pinned`
- `src/shared/ipc-contracts.ts` — 新增 `panelTogglePin` / `panelCommitResize` 频道；`PanelAPI` 加方法
- `src/preload/panel.ts` — 暴露 `togglePin` / `commitResize`
- `src/main/store/migrations/index.ts` — 串入 `dropLegacyPinned`
- `src/main/panels/PanelManager.ts` — 删 `this.pinned` / 加 `this.panelMode` / `togglePin` / `commitResize`；所有 `emitState` 改传 `panelMode`
- `src/main/ipc/panelHandlers.ts` — 注册新 IPC handler
- `src/main/windows/WindowManager.ts` — 透出 `togglePin` / `commitResize`
- `src/renderer/panel-chrome/App.tsx` — 📌 按钮逻辑 + Pin/PinOff 切换 + 引入 ResizeHandle + `chromeState.panelMode`
- `src/renderer/dock/App.tsx` — `panel:state` 读 `panelMode` 取代 `pinned`
- `src/shared/window.d.ts` — `PanelAPI` 声明扩展

---

## Task 0: 建议先建分支快照

- [ ] **Step 0: 确认在 worktree 分支**

Run: `cd F:/下载/sidebar/.claude/worktrees/clever-fermat-484548 && git status && git branch --show-current`
Expected: branch `claude/clever-fermat-484548`，干净工作区（spec 已 commit）

---

## Task 1: 配置类型清理 — 删 `layout.pinned`

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`

- [ ] **Step 1: 改 `types.ts`**

`src/shared/types.ts`：`AppConfig.layout` 删 `pinned: boolean` 行。

```ts
  layout: {
    edge: Edge;
    panelDefaultWidth: number;
  };
```

- [ ] **Step 2: 改 `constants.ts`**

`src/shared/constants.ts:105-109` 默认 `layout` 去掉 `pinned: false`：

```ts
    layout: {
      edge: 'right',
      panelDefaultWidth: PANEL_DEFAULT_WIDTH
    },
```

- [ ] **Step 3: TypeCheck**

Run: `npm run typecheck 2>&1 | head -50`（如无该脚本用 `npx tsc --noEmit`）
Expected: **会报 type 错**，列出所有还在引用 `layout.pinned` 的文件。这些在 Task 3 / Task 7 逐个修。先不提交。

---

## Task 2: Migration — 丢弃老 `layout.pinned`

**Files:**
- Create: `src/main/store/migrations/dropLegacyPinned.ts`
- Create: `src/main/store/migrations/__tests__/dropLegacyPinned.test.ts`
- Modify: `src/main/store/migrations/index.ts`

- [ ] **Step 1: 写失败测试**

`src/main/store/migrations/__tests__/dropLegacyPinned.test.ts`：

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dropLegacyPinned } from '../dropLegacyPinned';

test('removes legacy layout.pinned field', () => {
  const input = {
    schemaVersion: 1,
    layout: { edge: 'right', panelDefaultWidth: 456, pinned: true }
  } as any;
  const output = dropLegacyPinned(input);
  assert.equal('pinned' in output.layout, false);
  assert.equal(output.layout.edge, 'right');
  assert.equal(output.layout.panelDefaultWidth, 456);
});

test('leaves config without layout.pinned untouched', () => {
  const input = {
    schemaVersion: 1,
    layout: { edge: 'left', panelDefaultWidth: 500 }
  } as any;
  const output = dropLegacyPinned(input);
  assert.equal(output.layout.edge, 'left');
  assert.equal(output.layout.panelDefaultWidth, 500);
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `cd F:/下载/sidebar/.claude/worktrees/clever-fermat-484548 && npx tsx --test src/main/store/migrations/__tests__/dropLegacyPinned.test.ts 2>&1 | tail -20`
Expected: FAIL（文件不存在）

- [ ] **Step 3: 写实现**

`src/main/store/migrations/dropLegacyPinned.ts`：

```ts
import type { AppConfig } from '../../../shared/types';

export const dropLegacyPinned = (config: AppConfig): AppConfig => {
  const layout = config.layout as AppConfig['layout'] & { pinned?: boolean };
  if (!('pinned' in layout)) {
    return config;
  }
  const { pinned: _discard, ...rest } = layout;
  return { ...config, layout: rest };
};
```

- [ ] **Step 4: 串进 `migrations/index.ts`**

`src/main/store/migrations/index.ts`：

```ts
import type { AppConfig } from '../../../shared/types';
import { dropLegacyPinned } from './dropLegacyPinned';

export const migrateConfig = async (config: AppConfig): Promise<AppConfig> => {
  return dropLegacyPinned(config);
};
```

- [ ] **Step 5: 跑测试确认通过**

Run: 同 Step 2
Expected: PASS ×2

- [ ] **Step 6: 提交**

```bash
git add src/main/store/migrations src/shared/types.ts src/shared/constants.ts
git commit -m "feat(m6): drop layout.pinned config field, add migration"
```

---

## Task 3: `PanelState` 合约改字段

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/main/panels/PanelManager.ts`（emit 位点先改签名，值下一 Task 补）
- Modify: `src/renderer/dock/App.tsx`

- [ ] **Step 1: 改类型**

`src/shared/types.ts`：`PanelState`：

```ts
export interface PanelState {
  activePanelId: string | null;
  panelVisible: boolean;
  panelMode: 'hover' | 'pinned';
  edge: Edge;
}
```

- [ ] **Step 2: `PanelManager` 签名改**

`src/main/panels/PanelManager.ts:580` `emitState` 改签名：

```ts
private emitState(
  edge: Edge,
  panelMode: 'hover' | 'pinned',
  panelVisible = this.state === 'open'
): void {
  this.emitPanelState({
    activePanelId: this.currentPanelId,
    panelVisible,
    panelMode,
    edge
  });
}
```

所有 `emitState(..., config.layout.pinned, ...)` 调用点（`:114 :119 :151 :184 :241`）暂时先改为 `emitState(edge, 'hover', ...)`（占位，Task 4 正式接 `this.panelMode`）。

- [ ] **Step 3: 渲染进程 Dock 更新**

`src/renderer/dock/App.tsx:15` 初始 state：

```ts
panelMode: 'hover' as const,
```

并删掉 `pinned: false`。`:38` 读 config 的地方删 `pinned: configResult.data.layout.pinned`。onPanelState 回调改用 `state.panelMode`。

- [ ] **Step 4: TypeCheck**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: 只剩 panel-chrome / PanelManager 其它遗留的 `pinned` 读——Task 4/5 修。不能通过没关系，先提交也行；本 Task 留到 Task 5 一起通过。

- [ ] **Step 5: 不提交**（等 Task 4 实现完整 panelMode 一起提交，避免中间断链）

---

## Task 4: `PanelManager.panelMode` + `togglePin` + `commitResize`

**Files:**
- Modify: `src/main/panels/PanelManager.ts`

- [ ] **Step 1: 字段替换**

`src/main/panels/PanelManager.ts:49` 删 `private pinned = false;` 改为：

```ts
private panelMode: 'hover' | 'pinned' = 'hover';
```

- [ ] **Step 2: 删 `applyHoverConfig` 里的 `this.pinned`**

`:374-378`：

```ts
private applyHoverConfig(config: AppConfig): void {
  this.edge = config.layout.edge;
  this.hoverCloseDelayMs = config.behavior.hoverCloseDelayMs;
}
```

- [ ] **Step 3: hover-close 闸门改读 `panelMode`**

`:159` `if (this.sticky || config.layout.pinned)` → `if (this.sticky || this.panelMode === 'pinned')`
`:416` `if (this.sticky || this.pinned)` → `if (this.sticky || this.panelMode === 'pinned')`

- [ ] **Step 4: 所有 emitState 传入 `this.panelMode`**

替换 Task 3 Step 2 的占位 `'hover'` 为 `this.panelMode`。例：

```ts
this.emitState(config.layout.edge, this.panelMode);
```

- [ ] **Step 5: `switchPanel` 固定态下不清 sticky**

`:347` `this.sticky = false;` → 

```ts
if (this.panelMode === 'hover') {
  this.sticky = false;
}
```

- [ ] **Step 6: 新增 `togglePin`**

在 `PanelManager` 类内加：

```ts
async togglePin(): Promise<void> {
  if (this.panelMode === 'hover') {
    this.panelMode = 'pinned';
    this.cancelCloseTimer();
    this.emitState(this.edge, this.panelMode);
    return;
  }
  this.panelMode = 'hover';
  this.emitState(this.edge, this.panelMode);
  if (this.state === 'open') {
    await this.hidePanel(false);
  }
}
```

- [ ] **Step 7: 新增 `commitResize`**

在类内加（参考 `applyPanelBounds` 风格）：

```ts
commitResize(newWidth: number): void {
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const min = 320;
  const max = Math.floor(display.workArea.width * 0.5);
  const width = Math.min(Math.max(Math.round(newWidth), min), max);

  this.panelWindow.updateBounds(this.edge, width);
  this.animationWindow.updateBounds(this.edge, width);

  const view = this.currentPanelId
    ? this.webPanelHost.getView(this.currentPanelId)
    : null;
  if (view) {
    const [w, h] = this.panelWindowRef.getContentSize();
    view.setBounds({ x: 0, y: CHROME_HEIGHT, width: w, height: h - CHROME_HEIGHT });
  }

  void this.configStore.update({ layout: { panelDefaultWidth: width } });
}
```

- [ ] **Step 8: TypeCheck**

Run: `npx tsc --noEmit 2>&1 | head -30`
Expected: main 全绿；仅余 renderer `panel-chrome` 还在读 `pinned`（Task 5 处理）

- [ ] **Step 9: 暂不提交**（等 Task 5）

---

## Task 5: `commitResize` 单测

**Files:**
- Create: `src/main/panels/__tests__/commitResize.test.ts`

> 说明：`commitResize` 依赖 `electron.screen` 与窗口，完整 E2E 无法 node test。这里只测 clamp 纯逻辑：抽一个内部辅助函数。

- [ ] **Step 1: 抽辅助纯函数**

在 `PanelManager.ts` 顶部（import 下、类外）加：

```ts
export const clampPanelWidth = (width: number, workAreaWidth: number): number => {
  const min = 320;
  const max = Math.floor(workAreaWidth * 0.5);
  return Math.min(Math.max(Math.round(width), min), max);
};
```

并把 `commitResize` 里的 clamp 换成 `const width = clampPanelWidth(newWidth, display.workArea.width);`

- [ ] **Step 2: 写失败测试**

`src/main/panels/__tests__/commitResize.test.ts`：

```ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampPanelWidth } from '../PanelManager';

test('clamps width to 320 minimum', () => {
  assert.equal(clampPanelWidth(100, 1920), 320);
  assert.equal(clampPanelWidth(0, 1920), 320);
  assert.equal(clampPanelWidth(-50, 1920), 320);
});

test('clamps width to half of work area maximum', () => {
  assert.equal(clampPanelWidth(9999, 1920), 960);
  assert.equal(clampPanelWidth(9999, 1366), 683);
});

test('passes through valid widths', () => {
  assert.equal(clampPanelWidth(500, 1920), 500);
  assert.equal(clampPanelWidth(320, 1920), 320);
  assert.equal(clampPanelWidth(960, 1920), 960);
});

test('rounds fractional widths', () => {
  assert.equal(clampPanelWidth(500.6, 1920), 501);
});
```

- [ ] **Step 3: 跑测试**

Run: `cd F:/下载/sidebar/.claude/worktrees/clever-fermat-484548 && npx tsx --test src/main/panels/__tests__/commitResize.test.ts 2>&1 | tail -20`
Expected: PASS ×4

- [ ] **Step 4: 跑全量测试**

Run: `npm test 2>&1 | tail -15`
Expected: 全绿，总数 = 旧 21 + 4（commitResize）+ 2（dropLegacyPinned）= 27

- [ ] **Step 5: 提交 Task 3/4/5**

```bash
git add src/shared/types.ts src/main/panels src/renderer/dock/App.tsx src/main/store/migrations
git commit -m "feat(m6): introduce panelMode state, togglePin, commitResize"
```

---

## Task 6: IPC 合约 — `panel:toggle-pin` / `panel:commit-resize`

**Files:**
- Modify: `src/shared/ipc-contracts.ts`
- Modify: `src/preload/panel.ts`
- Modify: `src/main/ipc/panelHandlers.ts`
- Modify: `src/main/windows/WindowManager.ts`

- [ ] **Step 1: 加频道常量与 API 声明**

`src/shared/ipc-contracts.ts` `IPC_CHANNELS` 内加：

```ts
  panelTogglePin: 'panel:toggle-pin',
  panelCommitResize: 'panel:commit-resize',
```

`PanelAPI` 接口加：

```ts
  togglePin: () => Promise<IpcResult<void>>;
  commitResize: (width: number) => Promise<IpcResult<void>>;
```

- [ ] **Step 2: preload 暴露**

`src/preload/panel.ts` `panelAPI` 对象内加：

```ts
  togglePin: () => ipcRenderer.invoke(IPC_CHANNELS.panelTogglePin),
  commitResize: (width) => ipcRenderer.invoke(IPC_CHANNELS.panelCommitResize, width),
```

- [ ] **Step 3: WindowManager 透出**

`src/main/windows/WindowManager.ts` 加两个方法代理到 `PanelManager`（查现有 `hidePanel` 风格）：

```ts
async togglePanelPin(): Promise<void> {
  await this.panelManager?.togglePin();
}

commitPanelResize(width: number): void {
  this.panelManager?.commitResize(width);
}
```

若 `panelManager` 字段名不同，按实际命名调整。

- [ ] **Step 4: 注册 handlers**

`src/main/ipc/panelHandlers.ts` 末尾（`panelsContextMenu` handler 之后、函数结束 `};` 之前）加：

```ts
ipcMain.handle(IPC_CHANNELS.panelTogglePin, async (): Promise<IpcResult<void>> => {
  try {
    await windowManager.togglePanelPin();
    return { ok: true, data: undefined };
  } catch (error) {
    logger.error('panel:toggle-pin failed', error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Unknown toggle pin error'
    };
  }
});

ipcMain.handle(
  IPC_CHANNELS.panelCommitResize,
  async (_event, width: number): Promise<IpcResult<void>> => {
    try {
      windowManager.commitPanelResize(width);
      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('panel:commit-resize failed', error);
      return {
        ok: false,
        error: error instanceof Error ? error.message : 'Unknown commit resize error'
      };
    }
  }
);
```

- [ ] **Step 5: TypeCheck + build + test**

Run: `npx tsc --noEmit 2>&1 | head -20 && npm test 2>&1 | tail -10`
Expected: 无 ts error；21+4+2=27 tests pass

- [ ] **Step 6: 提交**

```bash
git add src/shared/ipc-contracts.ts src/preload/panel.ts src/main/ipc/panelHandlers.ts src/main/windows/WindowManager.ts
git commit -m "feat(m6): add panel:toggle-pin / panel:commit-resize IPC channels"
```

---

## Task 7: 📌 按钮交互

**Files:**
- Modify: `src/renderer/panel-chrome/App.tsx`

- [ ] **Step 1: 引入 Pin 图标**

`src/renderer/panel-chrome/App.tsx:6` lucide-react import 已有 `PinOff`，加 `Pin`：

```ts
import { ..., Pin, PinOff, ... } from 'lucide-react';
```

- [ ] **Step 2: 读取 `panelMode`**

定位 `chromeState` 定义（`onPanelState` 回调处）。加 `panelMode: 'hover' | 'pinned'`；初值 `'hover'`；onPanelState 回调里从 payload 拷 `panelMode`。

- [ ] **Step 3: 替换 📌 按钮**

找到 `:576-581` 的占位 button，改为：

```tsx
<button
  type="button"
  className="flex h-8 w-8 items-center justify-center rounded text-white/72 hover:bg-white/8"
  title={chromeState.panelMode === 'pinned' ? '取消固定侧窗格' : '固定侧窗格'}
  onClick={() => void window.panelAPI.togglePin()}
>
  {chromeState.panelMode === 'pinned' ? <Pin size={14} /> : <PinOff size={14} />}
</button>
```

- [ ] **Step 4: 启动 + 手测**

Run: `npm run dev`
手测：
- 启动后 📌 显示斜杠（PinOff）
- 点一次 → 变实心 Pin；鼠标移出 Dock+Panel 区域 → Panel 不自动收起
- 再点 → 变回 PinOff，Panel 走收起动画
- 启动后 pinned 态 open → hover 出去不关 ✅

- [ ] **Step 5: 提交**

```bash
git add src/renderer/panel-chrome/App.tsx
git commit -m "feat(m6): wire 📌 button to panel:toggle-pin"
```

---

## Task 8: 固定态切图标 / 打开内置面板验收

**Files:** — 无代码修改（已由 Task 4 Step 5 搞定）

- [ ] **Step 1: 手测切图标**

Run: `npm run dev`
手测：
1. 📌 进入 pinned
2. 连续 hover 5 个不同站点图标（dev 模式有 8 个预置）
3. Panel 内容依次切换，**不走收起动画**
4. 📌 图标保持实心 Pin
5. 鼠标离开 Dock+Panel → Panel 不关

- [ ] **Step 2: 手测内置面板**

1. pinned 态下点 Dock 的 `+` → 添加站点面板在 pinned 容器内显示
2. Panel 不退 pinned
3. 右键某 web 图标 → edit-site 打开 → 仍 pinned
4. 打开 site-info 菜单项 → 仍 pinned

- [ ] **Step 3: 若某步失败，诊断**

- 若切图标掉回 hover：检查 `switchPanel` 是否还有地方改 `panelMode`（grep）
- 若内置面板不显示：检查 `showPanel(..., true)` 路径（`:287 :292`）

---

## Task 9: ResizeHandle 组件 + 主进程提交

**Files:**
- Create: `src/renderer/panel-chrome/components/ResizeHandle.tsx`
- Modify: `src/renderer/panel-chrome/App.tsx`（挂载 ResizeHandle）

- [ ] **Step 1: 写组件**

`src/renderer/panel-chrome/components/ResizeHandle.tsx`：

```tsx
import React, { useRef } from 'react';
import type { Edge } from '../../../shared/types';

interface Props {
  edge: Edge;
  targetSelector: string;  // 例 '.panel-chrome'，指向要改 width 的根 DOM
}

const MIN_WIDTH = 320;

const clampToScreen = (width: number): number => {
  const max = Math.floor(window.screen.availWidth * 0.5);
  return Math.min(Math.max(Math.round(width), MIN_WIDTH), max);
};

export const ResizeHandle: React.FC<Props> = ({ edge, targetSelector }) => {
  const activeRef = useRef(false);

  const onMouseDown = (event: React.MouseEvent) => {
    if (activeRef.current) return;
    const target = document.querySelector<HTMLElement>(targetSelector);
    if (!target) return;
    event.preventDefault();
    activeRef.current = true;

    const startX = event.screenX;
    const startWidth = target.offsetWidth;

    const onMove = (ev: MouseEvent) => {
      const delta = edge === 'right' ? startX - ev.screenX : ev.screenX - startX;
      const next = clampToScreen(startWidth + delta);
      target.style.width = `${next}px`;
    };

    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const finalW = clampToScreen(target.offsetWidth);
      activeRef.current = false;
      void window.panelAPI.commitResize(finalW);
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  const positionStyle: React.CSSProperties =
    edge === 'right'
      ? { left: 0, top: 0, bottom: 0, width: 4 }
      : { right: 0, top: 0, bottom: 0, width: 4 };

  return (
    <div
      role="separator"
      aria-orientation="vertical"
      onMouseDown={onMouseDown}
      style={{ position: 'absolute', cursor: 'ew-resize', zIndex: 50, ...positionStyle }}
    />
  );
};
```

- [ ] **Step 2: 在 panel-chrome 挂载**

`src/renderer/panel-chrome/App.tsx`：

- 顶部 import：`import { ResizeHandle } from './components/ResizeHandle';`
- 找到 panel-chrome 最外层容器（class 含 `panel-chrome` 的 div）。若没有该 class，选最合适的根 div 并给它 `className="panel-chrome ..."` / 或用现有唯一选择器替代传入 `targetSelector`
- 在该容器内条件渲染：

```tsx
{chromeState.panelMode === 'pinned' && (
  <ResizeHandle edge={chromeState.edge} targetSelector=".panel-chrome" />
)}
```

> ⚠️ 确认 `targetSelector` 匹配的 DOM 就是需要改 `width` 的那层。如果现有样式用的是 `position: fixed; right: 0` + 定宽，改这个 div 的 `style.width` 即可；若宽度在祖先层控制，改祖先选择器。实际挂载时用 DevTools 手工验证一次再提交。

- [ ] **Step 3: 启动手测**

Run: `npm run dev`

1. hover 态：内侧无 4px resize 光标 ✅（ResizeHandle 不渲染）
2. 📌 进入 pinned：内侧出现 `ew-resize` 光标
3. 按住拖：chrome 宽度实时变
4. 松开：Panel 窗口宽度一次性对齐；view 同步
5. 拖到极限：左边界停在 320px，右边界停在 `screen.availWidth × 0.5`

- [ ] **Step 4: 诊断钩子（调试用）**

在 `PanelManager.commitResize` 开头加一行 `logger.info('[m6] commitResize', { newWidth });`。手测期间查日志：一次拖拽 mouseup 只出现 **1 条** 日志。出现多条 = mousemove 误发。

手测通过后保留日志（方便后续回归），或删除视习惯。

- [ ] **Step 5: 提交**

```bash
git add src/renderer/panel-chrome
git commit -m "feat(m6): add ResizeHandle for pinned-mode width drag"
```

---

## Task 10: 回归

- [ ] **Step 1: 全量单测**

Run: `cd F:/下载/sidebar/.claude/worktrees/clever-fermat-484548 && npm test 2>&1 | tail -15`
Expected: 全绿

- [ ] **Step 2: 走一遍 PRD 验收**

参照 spec §8 逐条手测：

- [ ] 点 📌 切固定态，图标变 Pin；再点变 PinOff 且 Panel 收起
- [ ] 固定态下 hover-close 不触发
- [ ] 固定态切图标 ≥ 5 次保持 pinned
- [ ] 固定态打开 add-site / edit-site / site-info 保持 pinned
- [ ] 内侧边缘 4px `cursor: ew-resize`
- [ ] 拖宽范围 [320, workArea × 0.5]
- [ ] 拖宽 mousemove 日志无 `setBounds`
- [ ] 拖宽 mouseup 后三处几何对齐，无错位
- [ ] `panelDefaultWidth` 重启生效
- [ ] 重启后 `panelMode` 回 hover
- [ ] 老配置含 `layout.pinned` 字段 → 读后字段消失，无报错（手工塞 `{layout:{pinned:true,...}}` 到 `%AppData%/<app>/config.json`，启动应自动剔除）

- [ ] **Step 3: 更新 README milestone 状态**

`README.md:12` `M6: paused after architectural review` → `M6: completed`

- [ ] **Step 4: 最终提交**

```bash
git add README.md
git commit -m "docs: mark M6 complete"
```

---

## 注意事项（给实施者）

1. **PRD §5.14 是铁律**：mousemove 只改 CSS，mouseup 只发一次 IPC；主进程一次 tick 内同步完成 3 处 setBounds + 1 次 config 写。不要加 `await` 到 commitResize 主路径里（`configStore.update` 用 `void` 不等）。
2. **panelMode vs sticky**：两者正交。pinned 下别清 sticky（Task 4 Step 5 已处理），hover 切 sticky 行为维持 M5 现状。
3. **日志检查**：PRD §5.14.8 明确"一次拖宽 1 条 setBounds 日志"。超了 = bug，停手找根因。
4. **不做的**：Win32 AppBar、左右贴边切换（M7）、全屏联动（M7）、配置里 lastActivePanelId（用户明确选 C1）。
5. **不提交敏感**：migration 测试若涉及真实用户 config 文件，用临时 fixture，不要碰 `%AppData%`。

---

**文档结束**
