# UX 优化：4 项改进设计方案

日期：2026-05-12

## 概述

对 SideBar Electron 应用的 4 项独立 UX 改进：

1. 面板加载进度条
2. 复制链接 Toast 反馈
3. 拖拽调宽手柄可见性
4. Favicon 重试次数上限

---

## 1. 面板加载进度条

**目标：** 面板内容加载时在顶部显示进度条，让用户知道面板没有卡死。

**位置：** `src/renderer/panel-chrome/App.tsx`

**行为：**
- `navigationState.isLoading` 变为 `true` 时：进度条从 0% 在 1.5s 内过渡到 70%（CSS transition 模拟假进度）
- `isLoading` 变为 `false` 时：进度条跳到 100%，200ms 后淡出并从 DOM 移除
- 进度条位于 chrome header 和网页内容之间（绝对定位，z-index 高于内容层）
- 颜色：固定使用 `#6c63ff`

**实现：**
- 无需新增 IPC 通道——`NavigationState.isLoading` 已存在，通过 `onNavigationState` 下发
- React state：`loadingProgress: number`（0–100）+ `loadingVisible: boolean`
- CSS：假进度用 `transition: width 1.5s ease-out`，淡出用 `transition: opacity 0.2s`
- 高度：2px，全宽，无圆角

**边界情况：**
- 若进度条正在淡出时新导航开始，立即重置到 0% 并重新显示
- `loadingVisible` 为 false 时不渲染进度条，避免影响布局

---

## 2. 复制链接 Toast

**目标：** 点击复制链接后给用户明确的成功反馈。

**位置：** `src/renderer/panel-chrome/App.tsx`

**行为：**
- 触发时机：点击复制按钮且 `navigator.clipboard.writeText()` 成功后
- Toast 样式：绿色胶囊（`✓ 链接已复制`），水平居中，位于 chrome header 下方 8px
- 显示 2 秒后 200ms 淡出消失
- 若复制失败（clipboard API 报错），不显示 Toast（静默失败，与当前行为一致）

**实现：**
- 无需新增 IPC 通道——clipboard 写入完全在 renderer 层处理
- React state：`showCopyToast: boolean`
- `setTimeout` 2000ms 后清除状态
- CSS：`position: absolute`、`top: header高度 + 8px`、`left: 50%`、`transform: translateX(-50%)`、`z-index: 100`
- 样式：`background: #4ade80`、`color: #000`、`font-size: 12px`、`font-weight: 600`、`padding: 4px 14px`、`border-radius: 20px`
- 淡出：用 CSS class 切换控制 `opacity` transition 0.2s（不用卸载组件，保留过渡动画）

---

## 3. 拖拽调宽手柄可见性

**目标：** 鼠标悬停在拖拽区域时显示发光边线，让用户发现可以调整面板宽度。

**位置：** `src/renderer/panel-chrome/components/ResizeHandle.tsx`

**行为：**
- 鼠标进入 8px 拖拽区域时：在手柄内侧边缘出现一条 2px 宽的竖向发光线
- 线条样式：`linear-gradient(180deg, transparent 0%, #6c63ff 30%, #6c63ff 70%, transparent 100%)`，透明度 0.7
- 淡入：`opacity` transition 0.15s ease
- 淡出：鼠标离开时同样的 transition
- 拖拽进行中：发光线保持全透明度显示

**实现：**
- 在 `ResizeHandle` 中添加 `isHovered: boolean` state
- `onMouseEnter` → `setIsHovered(true)`，`onMouseLeave` → `setIsHovered(false)`（仅在非拖拽状态下）
- 在手柄内渲染一个 `<div>` 作为发光线，由 `isHovered || isDragging` 控制显示
- 发光线 div：`position: absolute`、`width: 2px`、`height: 100%`，贴近面板一侧（面板在右侧时贴左边，面板在左侧时贴右边）
- 边缘方向通过 `App.tsx` 传入 prop（`App.tsx` 已有 `config.layout.edge`）

---

## 4. Favicon 重试次数上限

**目标：** 最多重试 5 次后停止，避免无限发起网络请求。

**位置：** `src/renderer/dock/components/DockItem.tsx`

**行为：**
- 当前：按指数退避（5s → 10s → 20s → 40s 封顶）无限重试
- 修改后：`retryTick >= 5` 时停止重试
- 达到上限后：保持字母 fallback 显示，本次会话内不再重试
- 用户无感知变化——字母 fallback 本来就已经在显示

**实现：**
- 在重试 `useEffect` 中添加守卫：`if (retryTick >= 5) return;`
- 无需 UI 改动——`iconFailed` 为 true 时字母 fallback 已正确渲染

---

## 涉及文件

| 文件 | 改动内容 |
|------|---------|
| `src/renderer/panel-chrome/App.tsx` | 添加进度条 state + 渲染，添加复制 Toast state + 渲染 |
| `src/renderer/panel-chrome/components/ResizeHandle.tsx` | 添加 hover state + 发光线渲染，接收 `edge` prop |
| `src/renderer/panel-chrome/panel.css` | 添加进度条和 Toast 的 CSS 类 |
| `src/renderer/dock/components/DockItem.tsx` | 添加 `retryTick >= 5` 守卫 |

---

## 不在范围内

- 键盘快捷键
- Dock 图标通知角标
- 面板悬停预览
- IPC 合约或主进程的任何改动
