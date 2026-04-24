# Sidebar Plus — 产品需求文档 (PRD v1.0)

> **本文档为 Codex 等 AI 编程助手的可执行规范**。所有决策已与产品负责人确认。开发实现时以本文档为唯一权威来源。UI 细节以"附录 A"中的参考截图为准。

| 项目 | 内容 |
|---|---|
| 项目代号 | Sidebar Plus |
| 英文名 | `SideBar Plus` |
| 二进制名 | `sidebar-plus` |
| AppID (AUMID) | `com.sidebarplus.app` |
| 版本 | v1.0（MVP） |
| 目标平台 | Windows 10 (1809+) / Windows 11 |
| 文档版本 | 2026-04-17 |

---

## 1. 项目背景与目标

### 1.1 背景
Microsoft Edge 的 Edge Bar（桌面版边栏）是一个高效的工作流工具，支持将网站固定为图标、悬停弹出页面、挤压桌面工作区。但存在以下痛点：
- 最新版强制使用**透明背景**且不可自定义
- 在 **Windows 11** 上由于与 Copilot 冲突，多数配置下功能被隐藏或不完整
- 只能贴在桌面**右侧**，不支持左贴边

### 1.2 产品目标
开发一个独立的桌面侧边栏应用，完整复刻 Edge Bar 的核心交互体验，并修复上述痛点：
- 完全不透明、可配置的外观
- 完整支持 Windows 10 和 Windows 11
- 支持左/右贴边切换
- 为未来扩展"本地小工具"（计算器、笔记、Drop 类文件中转）预留架构空间

### 1.3 非目标（v1.0 明确不做）
- 不做本地小工具面板（但架构必须预留）
- 不做多设备同步
- 不做浏览器扩展
- 不做多语言（仅 zh-CN，但字符串必须抽到 i18n 文件以便后续扩展）
- 不做深色/浅色主题切换（固定为深色，与 Edge Bar 一致）
- 不做代码签名（v1.0 发布未签名安装器）

---

## 2. 技术栈（锁定版本）

| 层 | 技术 | 版本约束 | 理由 |
|---|---|---|---|
| 运行时 | Electron | `^34.0.0` | 最新稳定大版本，Win10/11 兼容 |
| 语言 | TypeScript | `^5.4.0` | 严格类型，减少运行时错误 |
| UI 框架 | React | `^18.3.0` | Codex 样本最多 |
| 构建工具 | Vite | `^5.4.0` | 快速 HMR |
| Electron 集成 | `electron-vite` | `^3.0.0` | 多进程构建最成熟方案 |
| 打包 | `electron-builder` | `^25.0.0` | NSIS 安装器 |
| 状态管理 | `zustand` | `^5.0.0` | 轻量，Codex 友好 |
| 日志 | `electron-log` | `^5.2.0` | 分级 + 文件滚动 |
| 开机自启 | `auto-launch` | `^5.0.6` | 注册表 Run 键封装 |
| CSS | Tailwind CSS | `^3.4.0` | 原子类，UI 迭代快 |
| 图标 | `lucide-react` | `^0.460.0` | 内置标题栏 UI 图标 |

### 2.1 禁止使用
- `node-ffi-napi`
- `electron-forge`（与本 PRD 的 `electron-vite + electron-builder` 方案冲突）
- 非必要的 Win32 FFI / 原生模块。v1.0 默认不引入 AppBar 级系统保留区能力；若未来恢复此方案，须先通过单独设计评审。

---

## 3. 架构设计

### 3.1 进程模型

```
┌─────────────────────────────────────────────────────┐
│                   Main Process                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │
│  │WindowManager│ │ConfigStore  │ │PanelManager │    │
│  └─────────────┘ └─────────────┘ └─────────────┘    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐    │
│  │PanelRegistry│ │ TrayManager │ │FullscreenDet│    │
│  └─────────────┘ └─────────────┘ └─────────────┘    │
└─────────────────────────────────────────────────────┘
        │              │                    │
        │              │                    │
   ┌────▼────┐   ┌─────▼──────┐      ┌──────▼──────┐
   │  Dock   │   │   Panel    │      │WebContentsV │
   │ Window  │   │  Window    │      │(per site)   │
   │(renderer│   │ (chrome UI │      │             │
   │ process)│   │  renderer) │      │             │
   └─────────┘   └────────────┘      └─────────────┘
```

**关键设计**：
- **DockWindow**：独立 BrowserWindow，始终存在，宽 44px，垂直占满屏幕高度
- **PanelWindow**：独立 BrowserWindow，含标题栏 UI（渲染进程）+ 一个 `WebContentsView` 容器区域
- **可选辅助窗口**：允许存在单独的 `PanelAnimationWindow`、`PanelMenuWindow` 等非主交互窗口，用于动画/菜单层级问题。它们不改变 Dock 与 Panel 的主职责划分
- **每个站点**拥有一个 `WebContentsView` 实例，被添加到 PanelWindow 的 contentView 树中
- **切换站点** = 改变 PanelWindow 当前显示的 WebContentsView（非销毁重建）

### 3.2 `PanelProvider` 抽象（关键扩展点）

```typescript
// src/shared/types.ts
export type PanelType = 'web' | 'builtin';

export interface PanelDescriptor {
  id: string;                    // 唯一 ID（nanoid）
  type: PanelType;
  title: string;                 // 显示名
  iconSource: IconSource;        // 图标来源
  order: number;                 // 排序权重
  preferredWidth: number;        // 面板宽度（v1.0 默认跟随全局宽度；v2 可扩展为站点级独立宽度）
  web?: WebPanelConfig;
  builtin?: BuiltinPanelConfig;
}

export interface WebPanelConfig {
  url: string;                   // 完整 URL（含 scheme）
  openInBrowser: string;         // 外开目标浏览器 ID，'system' = 系统默认
  zoomFactor: number;            // 缩放因子，默认 1.0
  userAgentMode: 'desktop' | 'mobile';
}

export interface BuiltinPanelConfig {
  widgetId: string;              // v1 保留字段，暂不使用
}

export interface IconSource {
  kind: 'auto' | 'custom' | 'letter';
  path?: string;                 // custom 时：本地路径
  fallbackLetter?: string;       // letter 时：单个字符
  fallbackColor?: string;        // letter 时：HEX 背景色
}
```

**内置面板**（v1 实现）：
- `builtin:add-site` — 添加网页面板（由底部 `+` 触发，**不出现在 Dock 图标列表中**）
- `builtin:settings` — 设置面板（由 `⋮` 菜单里的"设置"项触发）
- `builtin:edit-site:<panelId>` — 编辑站点内置面板
- `builtin:site-info:<panelId>` — 站点信息内置面板

内置面板同样经过 PanelWindow 渲染，区别是它们的内容不是 WebContentsView，而是 PanelWindow 的渲染进程内直接渲染的 React 组件。v1.0 不要求为每个内置面板分拆独立 renderer 入口，允许在 `panel-chrome` 渲染树内部按 `builtin.widgetId` 分支渲染。

### 3.3 IPC 通信协议

**命名约定**：`<domain>:<action>`，请求型 IPC 统一通过 `ipcMain.handle` + `ipcRenderer.invoke`（Promise 化）。

**返回约定**：
- 所有请求型 IPC 统一返回 `IpcResult<T>`
- 成功：`{ ok: true, data: T }`
- 失败：`{ ok: false, error: string }`
- 推送型事件（如 `panel:state`）不走 `IpcResult`

| Channel | 方向 | Payload | 返回 |
|---|---|---|---|
| `config:read` | R→M | `void` | `IpcResult<AppConfig>` |
| `config:update` | R→M | `Partial<AppConfig>` | `IpcResult<AppConfig>` |
| `panels:list` | R→M | `void` | `IpcResult<PanelDescriptor[]>` |
| `panels:add` | R→M | `Omit<PanelDescriptor, 'id' \| 'order'>` | `IpcResult<PanelDescriptor>` |
| `panels:update` | R→M | `{ id, patch: Partial<PanelDescriptor> }` | `IpcResult<PanelDescriptor>` |
| `panels:remove` | R→M | `{ id }` | `IpcResult<void>` |
| `panels:reorder` | R→M | `string[]` (id 数组新顺序) | `IpcResult<void>` |
| `panels:hover` | R→M | `{ id }` | `IpcResult<void>` |
| `panels:show` | R→M | `{ id }` | `IpcResult<void>` |
| `panels:hide` | R→M | `void` | `IpcResult<void>` |
| `panels:schedule-hide` | R→M | `void` | `IpcResult<void>` |
| `panels:cancel-hide` | R→M | `void` | `IpcResult<void>` |
| `panels:minimize` | R→M | `void` | `IpcResult<void>` |
| `panels:close` | R→M | `void` | `IpcResult<void>` |
| `panels:mark-sticky` | R→M | `void` | `IpcResult<void>` |
| `panels:menu-open` | R→M | `PanelMenuAnchor` | `IpcResult<void>` |
| `panels:menu-close` | R→M | `void` | `IpcResult<void>` |
| `panels:menu-close-and-resume-hover` | R→M | `void` | `IpcResult<void>` |
| `panels:menu-state` | R→M | `{ panelId }` | `IpcResult<PanelMenuState>` |
| `panels:menu-action` | R→M | `PanelMenuActionPayload` | `IpcResult<PanelMenuState>` |
| `panels:open-external` | R→M | `{ panelId, url? }` | `IpcResult<void>` |
| `panels:go-back` | R→M | `{ panelId }` | `IpcResult<void>` |
| `panels:pick-icon` | R→M | `void` | `IpcResult<string \| null>` |
| `panels:context-menu` | R→M | `{ id }` | `IpcResult<void>` |
| `panels:get-site-info` | R→M | `{ panelId }` | `IpcResult<SiteInfo>` |
| `app:hide-to-tray` | R→M | `void` | `IpcResult<void>` |
| `app:toggle-dock-visibility` | R→M | `void` | `IpcResult<boolean>` |
| `browsers:list` | R→M | `void` | `IpcResult<BrowserInfo[]>` |
| `favicon:fetch` | R→M | `{ url }` | `IpcResult<FaviconFetchResult>` |
| `panel:state` | M→R | (push) `{ activePanelId, panelVisible, panelMode, edge }` | — |
| `panels:updated` | M→R | (push) `PanelsUpdatedPayload` | — |
| `panel:animate-in` | M→R | (push) `PanelAnimatePayload` | — |
| `panel:animate-out` | M→R | (push) `void` | — |
| `panel-animation:open` | M→R | (push) `PanelAnimationPayload` | — |
| `panel-animation:close` | M→R | (push) `PanelAnimationPayload` | — |
| `panel-animation:reset` | M→R | (push) `void` | — |
| `chrome:fade-out` | M→R | (push) `void` | — |
| `chrome:fade-in` | M→R | (push) `PanelChromePayload` | — |
| `panel:navigation-state` | M→R | (push) `PanelNavigationPayload` | — |

### 3.4 Preload 脚本

每个渲染进程有独立 preload，最小权限：
- `preload/dock.ts`：暴露 `window.dockAPI`
- `preload/panel.ts`：暴露 `window.panelAPI`
- `preload/builtin.ts`：暴露 `window.builtinAPI`（供内置面板使用）

---

## 4. 数据模型

### 4.1 配置文件

**路径**：`%APPDATA%\SideBar Plus\config.json`（Electron `app.getPath('userData')`）

**Schema**：
```typescript
export interface AppConfig {
  schemaVersion: 1;
  app: {
    autoLaunch: boolean;           // 开机自启，默认 true
    autoShowDock: boolean;         // 启动时显示 Dock，默认 true
    hideOnFullscreen: boolean;     // 全屏应用时自动隐藏，默认 true
  };
  layout: {
    edge: 'left' | 'right';        // 默认 'right'
    panelDefaultWidth: number;     // 默认 456
  };
  behavior: {
    hoverOpenDelayMs: number;      // 默认 200
    hoverCloseDelayMs: number;     // 默认 300
    keepAudioOnHide: boolean;      // 默认 true
  };
  panels: PanelDescriptor[];       // 用户配置的站点列表（不含内置）
  meta: {
    createdAt: string;             // ISO8601
    lastUpdatedAt: string;         // ISO8601
  };
}
```

**默认值**（首次启动生成）：
```json
{
  "schemaVersion": 1,
  "app": { "autoLaunch": true, "autoShowDock": true, "hideOnFullscreen": true },
  "layout": { "edge": "right", "panelDefaultWidth": 456 },
  "behavior": { "hoverOpenDelayMs": 200, "hoverCloseDelayMs": 300, "keepAudioOnHide": true },
  "panels": [],
  "meta": { "createdAt": "...", "lastUpdatedAt": "..." }
}
```

### 4.2 存储路径清单

| 内容 | 路径 |
|---|---|
| 配置 | `%APPDATA%\SideBar Plus\config.json` |
| 配置备份 | `%APPDATA%\SideBar Plus\config.json.bak` |
| 自定义图标 | `%APPDATA%\SideBar Plus\icons\<panelId>.<ext>` |
| Favicon 缓存 | `%APPDATA%\SideBar Plus\cache\favicons\<domain>.png` |
| WebContents Session | `%APPDATA%\SideBar Plus\sessions\shared\`（Electron 自管） |
| 日志 | `%APPDATA%\SideBar Plus\logs\main.log`（滚动，5MB × 5） |

### 4.3 配置读写策略

- **启动**：同步读取 `config.json`，若不存在则创建默认；若 JSON 解析失败则加载 `config.json.bak`；若仍失败则重置为默认并日志 ERROR
- **写入**：先写入 `config.json.tmp` → `fs.rename` 原子替换 `config.json`
- **每次成功写入**后，复制一份到 `config.json.bak`
- **Schema 迁移**：`schemaVersion` 不匹配时调用 `migrations/<version>.ts`（v1 暂无迁移）

---

## 5. 核心功能规格

### 5.1 Dock（图标栏）

| 属性 | 值 |
|---|---|
| 宽度 | 44 px |
| 高度 | 等于所在显示器工作区高度（扣除任务栏） |
| 位置 | 默认右贴边（屏幕最右），设置可切换左贴边 |
| 置顶 | 始终置顶（`setAlwaysOnTop(true, 'pop-up-menu')`） |
| 背景色 | `#1F1F1F`（完全不透明） |
| 无边框 | `frame: false`, `transparent: false` |
| 任务栏中 | 不显示（`skipTaskbar: true`） |
| Alt+Tab | 不出现（`skipTaskbar` 自动处理） |
| 可拖动 | 否（位置由程序管理） |
| 可调整大小 | 否 |

**Z-order 注意事项**：
- 使用 `BrowserWindow.setAlwaysOnTop(true, 'screen-saver')` 使其高于绝大多数窗口
- 但不能高于 Windows 系统 UI（开始菜单、任务栏、通知中心）——这由 Windows 自动处理

### 5.2 站点图标列表（Dock 上部）

**图标尺寸**：28×28 px（图标本身），容器 44×44 px（高度）

**布局**（从上到下垂直排列）：
```
┌──────────┐
│  [图标1] │ ← 44×44 容器，28×28 图标居中
├──────────┤
│  [图标2] │
├──────────┤
│   ...    │
└──────────┘
```

**状态视觉**：
- 默认：图标 + 透明背景
- 悬停：背景变为 `rgba(255,255,255,0.08)`，圆角 8px
- 激活（当前面板显示的站点）：左侧（或右侧，取决于贴边方向）有一条 2px × 20px 的蓝色指示条（`#4CC2FF`）+ 背景 `rgba(255,255,255,0.12)`

**交互**：
- **悬停** → 触发面板打开逻辑（见 5.4）
- **左键点击** → 等同悬停打开，但**标记为"粘性打开"**（鼠标移出不自动关闭，见 5.4.3）
- **右键** → 弹出上下文菜单：`从边栏取消固定`（点击即移除，无二次确认）
- **长按+拖动** → 开始拖拽排序（见 5.2.2）

#### 5.2.1 溢出处理
当图标总高度超过可用高度时：
- **不显示滚动条**
- 溢出时最后一个可见图标**显示一半**作为提示
- **鼠标滚轮**在 Dock 区域上滚动 → 图标列表整体上下滚动（步长 = 一个图标高度 = 44px，带 150ms 缓动动画）
- 滚动不循环（到顶/到底停住）

#### 5.2.2 拖拽排序
- 长按 ≥ 250ms 进入拖拽态
- 拖拽时：被拖图标跟随鼠标（透明度 0.6），其他图标根据鼠标 Y 坐标重排（带 150ms 过渡动画）
- 松开鼠标提交新顺序，调用 `panels:reorder`
- 拖拽时面板**暂停响应悬停**
- 拖拽到 Dock 区域外 → 取消（图标回到原位）

### 5.3 底部工具区（Dock 下部）

自上而下三个按钮，每个 44×44：

| 按钮 | 图标 | 行为 |
|---|---|---|
| `+` | `lucide:plus` | **悬停** → 打开"添加网页"内置面板（不用点击，保持与网站图标一致的交互） |
| `⋮` | `lucide:more-vertical` | **点击** → 向左/右上方弹出菜单（见 5.3.1） |
| `×` | `lucide:x` | **点击** → 隐藏 Dock 到系统托盘（应用继续运行），tooltip: "隐藏侧边栏" |

**`+` 按钮**：悬停触发的"添加网页"面板，关闭逻辑与普通面板一致。点击与悬停行为相同（点击 = 粘性打开）。

**`×` 按钮**：点击后 Dock 窗口 `hide()`，同时隐藏面板。右键托盘图标 → "显示侧边栏"恢复。

#### 5.3.1 `⋮` 菜单（全局快捷菜单）
参考**附录 A 图 2**。弹出式菜单（非完整设置面板），向贴边的相反方向上方弹出。内容：

```
✓ 自动启动 Sidebar Plus      ← 复选项，勾选状态反映 config.app.autoLaunch
  ─────────────
  [齿轮] 设置                 ← 点击打开"设置"内置面板
  [信息] 关于                 ← 点击打开"关于"弹窗（版本/官网/检查更新）
```

**不包含**"发送反馈"项（Edge Bar 有，我们省略）。

菜单样式：黑色背景（`#2D2D2D`），白色文字，圆角 8px，阴影 `0 4px 16px rgba(0,0,0,0.3)`。hover 项 `rgba(255,255,255,0.08)`。

### 5.4 悬停面板行为

#### 5.4.1 触发时机
- 鼠标**进入**任意图标（站点或 `+`）连续停留 **`hoverOpenDelayMs`** 毫秒（默认 200ms） → 开始打开面板
- **打开动画**：150ms，`ease-out`，面板从 Dock 内侧滑出（右贴边时向左展开）
- 动画期间若鼠标已离开 → 完成动画后立即进入关闭倒计时

> ⚠️ **动画实现必须严格遵守 §5.14 的工程准则。** 本小节仅描述用户感知的行为，实现细节、禁止调用 `setBounds` / 时序编排等全部以 §5.14 为准。

#### 5.4.2 关闭时机
- 鼠标**离开**（面板 + Dock 的合并区域外） **`hoverCloseDelayMs`** 毫秒（默认 300ms） → 开始关闭面板
- **关闭动画**：150ms，`ease-in`，面板缩回 Dock
- 关闭动画期间若鼠标再次进入该图标 → 取消关闭，回到展开态（无闪动）

> ⚠️ **实现见 §5.14。** 收起阶段 WebContentsView 必须先 `setBounds` 到 `(0,0,0,0)` 再开始 CSS 退出动画，否则会看到 WebContentsView 固定在原位、chrome 却在移动的"穿帮"现象。

#### 5.4.3 粘性打开
**以下情况视为"粘性"**，鼠标移出不自动关闭：
- 用户在面板内**点击过**任何位置（mousedown 触发）
- 用户在面板内**键盘输入过**（input / keydown 触发）
- 面板处于**固定模式**（见 5.7）

**解除粘性**的方式：
- 点击面板标题栏的 **最小化** 或 **关闭** 按钮
- 点击其他图标（切换到其他面板）
- 点击 Dock 外部任意区域

粘性状态记录在主进程的 `PanelManager` 中，不写入持久化配置。

#### 5.4.4 跨图标切换
鼠标从图标 A **直接滑到** 图标 B（均为站点图标，不经过 Dock 外区域）：
- **无缝切换**：面板本身不关闭，只替换内部 WebContentsView
- **动画**：标题栏内容淡入替换（100ms opacity），WebContentsView 瞬时切换（无淡入）
- **宽度过渡**：若 A 与 B 的 `preferredWidth` 不同，**v1 采用瞬时切换**（非动画），避免窗口 resize 抖动。未来若要加宽度过渡动画，必须遵循 §5.14 的拖拽提交模式
- `hoverOpenDelayMs` 不重新计时（切换视为同一次交互）

若跨到 `+` 按钮：同样无缝切换到"添加网页"内置面板。

> ⚠️ **实现见 §5.14。** 切换必须保证"旧 view `setBounds(0,0,0,0)` + 新 view `setBounds(最终值)`"各调用一次，不得使用 opacity 动画控制 WebContentsView 可见性（WebContentsView 不支持 opacity）。

### 5.5 面板外框（标题栏）

**面板窗口结构**：
```
┌─────────────────────────────────────────┐
│ [标题]             [↗] [⋮] [📌] [–] [×] │ ← 标题栏，高度 40px
│ [favicon] URL                           │ ← 地址栏（只读），高度 28px
├─────────────────────────────────────────┤
│                                         │
│          WebContentsView 或              │
│          内置面板渲染区                  │
│                                         │
└─────────────────────────────────────────┘
```

参考**附录 A 图 3-7**。

**标题栏元素**（从左到右）：

| 元素 | 说明 |
|---|---|
| 站点标题 | 显示 `PanelDescriptor.title`，14px，加粗，白色 |
| [↗] `ExternalLink` | 外开按钮，tooltip "在新选项卡中打开链接"，点击时用 `WebPanelConfig.openInBrowser` 指定的浏览器打开当前 URL |
| [⋮] `MoreHorizontal` | 三点菜单，见 5.6 |
| [📌] `Pin` / `PinOff` | 固定按钮，tooltip "固定侧窗格" / "取消固定侧窗格"，见 5.7。图标未固定时带斜杠（PinOff），固定时无斜杠（Pin） |
| [–] `Minus` | 最小化，tooltip "最小化 [站点名] 窗格"，**收起面板但保留 WebContentsView** |
| [×] `X` | 关闭，tooltip "关闭 [站点名] 窗格"，**收起面板并销毁 WebContentsView 释放内存**（下次打开重新加载） |

**关闭 vs 最小化 的关键区别**：
- **最小化** (`Minus`)：等同于鼠标移出触发的关闭，WebContentsView 继续存在于内存，音视频继续（依据 `keepAudioOnHide`）
- **关闭** (`X`)：通过关闭动作销毁该站点的 WebContentsView，释放内存。**不从 Dock 中移除图标**。下次悬停该图标时重新创建 WebContentsView 并导航到 `url`

**地址栏**（标题栏下方一行）：
- 显示当前 WebContentsView 的实际 URL（随页面内导航更新）
- 左侧一个小 favicon
- **只读**，不可编辑（v1 不做站内导航栏）
- 字体 12px，`#B0B0B0`

### 5.6 面板三点菜单（[⋮]）

参考**附录 A 图 4**，菜单向下弹出，靠右对齐 `⋮` 按钮。内容（仅适用于 `WebPanel`，内置面板的菜单不同）：

| 项 | 图标 | 行为 |
|---|---|---|
| 刷新 | `RotateCw` | 调用 `webContents.reload()` |
| 复制链接 | `Link` | 将当前 URL 写入系统剪贴板 |
| 显示移动视图 | `Smartphone` | 复选项，切换 UserAgent（桌面 ⇄ 移动版 iPhone UA），切换后刷新页面 |
| 推迟通知 / 取消推迟通知 | `BellOff` | 复选项。切换当前站点的通知静默状态，不影响其他站点 |
| ─── 分隔线 ─── | | |
| 编辑此站点 | `Pencil` | 打开一个编辑对话框（与添加网页面板同构，但预填当前值） |
| 清除此站点数据 | `Trash2` | 弹确认框 "清除 [站点] 的所有 Cookie 和缓存？"，确认后调用 `session.clearStorageData({ origin: <url> })` |
| 站点信息 | `Info` | 打开"站点信息"子面板，显示：URL / 当前 UA / Cookie 数量 / 缓存大小 / 当前通知状态 |

**菜单样式**：黑色背景（`#2D2D2D`），白色文字，项高 32px，圆角 8px，阴影同全局菜单。

### 5.7 固定模式（Pinned Surface）

#### 5.7.1 激活
- 用户点击面板标题栏的 **📌** 按钮
- 面板切换为**固定展示态**：永久可见、悬停开关逻辑停用
- v1.0 **不要求也不允许**通过 Win32 AppBar / `SHAppBarMessage` 挤压系统工作区
- 固定态仍是普通置顶窗口，不改变其他应用的最大化区域
- `panelMode` 为纯内存态，不持久化；每次应用启动默认回到 `hover`

#### 5.7.2 固定态下的特殊行为
- 面板**常驻**，不再自动关闭
- Dock 仍然存在，用户可以**切换到其他站点**（面板内容替换，固定态保持）
- 点击其他图标 → WebContentsView 切换，**不退出固定模式**
- 点击 `+` → 打开"添加网页"面板，**也在固定模式内展示**
- 可**拖拽面板内边缘**调整宽度（见 5.7.3）
- 面板宽度变化 → 全局 `panelDefaultWidth` 配置更新（与悬停模式共用同一宽度值）

#### 5.7.3 边缘拖拽改宽度
- 固定模式下，面板内侧边缘 4px 区域光标变为 `ew-resize`
- 最小宽度 **320px**，最大宽度 **= 当前显示器工作区宽度 × 0.5**
- **拖拽过程**：仅用 CSS 改变 panel-chrome 的视觉宽度（见 §5.14.3）
- **松开鼠标（mouseup）时**：一次性执行 `BrowserWindow.setBounds` + `WebContentsView.setBounds` + 持久化到 `config.layout.panelDefaultWidth`
- **严禁在 mousemove 过程中调用 `setBounds`**，避免窗口抖动与系统重排

> ⚠️ **完整实现模板见 §5.14.3。** 此处只描述用户感知的行为。

#### 5.7.4 取消固定
- 点击标题栏 **📌** 按钮（变为 PinOff 图标）
- 面板回到悬停模式（当前面板关闭动画收起）
- `panelMode` 内存态切回 `hover`（不写配置）

### 5.8 左右贴边切换

#### 5.8.1 入口
**设置** → **外观** → "图标栏位置" 单选（左 / 右）

不提供快捷键（v1 低频操作）。

#### 5.8.2 切换过程
1. 若当前 `panelMode = pinned` → 先切回 `hover`（当前面板走收起动画）
2. Dock 窗口 `hide()`
3. 所有面板关闭
4. 重新计算 Dock 位置（x 坐标从 `workArea.x + workArea.width - 44` 变为 `workArea.x`，或反之）
5. Dock 窗口 `show()`
6. 所有面板的**展开方向**同步翻转（左贴边 → 面板向右展开；右贴边 → 面板向左展开）
7. `config.layout.edge` 持久化

**视觉**：无动画，直接切换（切换频率极低，不值得投入动画成本）。

### 5.9 系统集成

#### 5.9.1 开机自启
- 使用 `auto-launch` 库写入 `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- 值：`"C:\...\SideBar Plus.exe" --autostart`
- `--autostart` 参数触发"静默启动"模式：Dock 直接显示在屏幕边缘，不弹任何窗口
- 默认**开启**

#### 5.9.2 系统托盘
- 托盘图标：应用图标
- 左键单击：显示/隐藏 Dock（toggle）
- 右键菜单：
  - `显示侧边栏` / `隐藏侧边栏`（根据当前状态）
  - ─── 分隔线 ───
  - `设置`
  - `关于`
  - ─── 分隔线 ───
  - `退出`

#### 5.9.3 单实例锁
- 使用 `app.requestSingleInstanceLock()`
- 已有实例运行时，新进程立即退出；老进程通过 `second-instance` 事件激活 Dock（若被隐藏则显示）

#### 5.9.4 全屏应用检测
仅当 `config.app.hideOnFullscreen = true` 时启用。

**检测机制**：
- 每 500ms 调用 Win32 `GetForegroundWindow` + `GetWindowRect` + 对比目标显示器尺寸
- 前台窗口覆盖整个显示器（包含任务栏区域）→ 判定为全屏
- 排除自身窗口 ID

**触发效果**：
- 检测到全屏 → **Dock 窗口 `hide()`**，面板 `hide()`
- 全屏退出 → 恢复 Dock 显示（面板不自动恢复，等用户下次悬停）

**注意**：Win32 FFI 调用成本较高，使用 `setInterval(500)` 轮询，不使用更高频率。

### 5.10 Web 层行为

#### 5.10.1 共享 Session
所有 `WebPanel` 的 WebContentsView 共用：
```typescript
session.fromPartition('persist:shared', { cache: true })
```
一次 Google 登录所有 Google 相关站点生效，符合 Edge Bar 体验。

#### 5.10.2 链接打开规则

**页面内普通链接点击**（`<a href>` 非 `_blank`）：
- 在**当前 WebContentsView 内导航**（地址栏随之更新）

**页面内带 `target="_blank"` 的链接** 或 **`window.open` 调用**：
- 拦截 `setWindowOpenHandler`
- 返回 `{ action: 'deny' }`
- 然后用**该站点配置的 `openInBrowser`** 浏览器打开目标 URL
- **不**在侧栏内开新面板

**标题栏 `↗` 按钮**：
- 调用 `openInBrowser` 浏览器打开**当前 WebContentsView 的 URL**（不是站点初始 URL，是实际当前页）

#### 5.10.3 下载
- `session.on('will-download')` 拦截
- 下载到**系统默认下载目录**（`app.getPath('downloads')`）
- 下载开始时：系统通知（`new Notification(...)`）"开始下载 [文件名]"
- 下载完成时：系统通知 "[文件名] 下载完成"，点击通知 = 打开文件所在目录
- **不在面板内显示下载进度条**（v1 简化）
- 下载失败：系统通知错误

#### 5.10.4 通知
- 允许站点的 `Notification` API
- Electron 默认已支持，无需额外代码
- 权限申请：默认**允许**（与 Edge Bar 一致）

#### 5.10.5 音视频播放
- **`config.behavior.keepAudioOnHide = true`（默认）**：
  - 面板隐藏（关闭动画结束）后，**不**暂停媒体
  - YouTube / 网易云 / B 站等场景用户可以继续听
- **`config.behavior.keepAudioOnHide = false`**：
  - 面板隐藏后立即调用 `webContents.setAudioMuted(true)`
  - 面板再次显示时 `setAudioMuted(false)`
- **站点"关闭"操作（× 销毁 WebContentsView）** 无论 `keepAudioOnHide` 如何都会终止播放

#### 5.10.6 缩放记忆
- 面板打开时应用 `webContents.setZoomFactor(config.zoomFactor)`
- 监听缩放变化 → 更新该 Panel 的 `WebPanelConfig.zoomFactor` 并持久化
- Ctrl+0 重置到 1.0

### 5.11 内置面板：添加网页

参考**附录 A 图（前一张用户发的）**。触发方式：悬停 `+` 按钮。

**字段**：
| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| 网址 | 文本框 | 是 | placeholder: "例如 github.com 或 https://example.com"。提交时自动补 `https://` |
| 图标预览 | 图片区 | — | 64×64 大预览 + "手动选择图标" 按钮 + "清除自定义" 按钮 |
| 打开方式 | 下拉 | 是 | 默认 "系统默认浏览器（推荐）"。下拉项 = `browsers:list` IPC 返回的列表 |

**行为**：
- 网址失焦时触发 favicon 预取（FaviconService，见 7.3）
- "手动选择图标" → `dialog.showOpenDialog`，过滤 `.png/.jpg/.jpeg/.svg/.ico/.webp`
- 选中的图标立即预览（不等提交）
- "清除自定义" → 恢复自动获取的 favicon
- 底部按钮：
  - **取消**：关闭面板（无确认）
  - **添加到侧栏**：验证 URL 合法性（须是 http/https），调用 `panels:add`，关闭面板，Dock 新图标带一次脉冲动画（500ms 高亮）

**样式**：白色背景 `#1F1F1F`，圆角 8px 的表单卡片，与 Edge Bar 一致的深色风格。

### 5.12 内置面板：设置

由 `⋮` 菜单中"设置"项触发。

**左侧导航 + 右侧内容**（纵向分栏）。导航项：

**常规**
- 开机自启：开关（绑定 `config.app.autoLaunch`）
- 启动时显示侧边栏：开关（绑定 `config.app.autoShowDock`）
- 全屏应用时自动隐藏：开关（绑定 `config.app.hideOnFullscreen`）

**外观**
- 图标栏位置：单选（左 / 右）
- 面板默认宽度：滑块，320–800px，绑定 `config.layout.panelDefaultWidth`

**行为**
- 悬停触发延迟：滑块，100–500ms，绑定 `config.behavior.hoverOpenDelayMs`
- 离开关闭延迟：滑块，100–800ms，绑定 `config.behavior.hoverCloseDelayMs`
- 面板隐藏时继续播放音频：开关，绑定 `config.behavior.keepAudioOnHide`

**数据**
- 打开配置文件夹（按钮）→ `shell.openPath(app.getPath('userData'))`
- 导出配置（按钮）→ 弹出保存对话框，导出 `config.json`
- 导入配置（按钮）→ 弹出打开对话框，验证 schema，成功后重启应用
- 清除所有 Cookie 和缓存（按钮，红色）→ 二次确认 → `session.clearStorageData()`

**关于**
- 应用名 + 版本号
- 检查更新（按钮）→ 调用 `app:check-update`
- GitHub 仓库链接
- 退出程序（按钮）

### 5.13 内置面板：站点信息

由面板三点菜单的"站点信息"项触发。显示卡片式信息（只读）：
- 图标 + 站点标题
- 当前完整 URL
- 当前 User Agent 类型（桌面 / 移动）
- Cookie 数量
- 缓存大小（从 `session.getCacheSize()` 获取）
- 通知权限状态

### 5.14 窗口与动画工程准则（反模式警告）

> **本节是整个项目最重要的工程规范之一**。早期原型阶段出现过"面板展开/收起时整体乱跳""拖拽改宽时桌面所有窗口疯狂避让"等问题，根源都是违反了本节规则。**Codex 实现 M3、M4、M6 阶段时必须严格遵守，任何偏离需要先提出并获得产品负责人确认。**

#### 5.14.1 核心原则（铁律）

1. **窗口不做动画，CSS 做动画。** 视觉上的滑动、淡入、宽度变化一律由渲染进程 CSS `transition` 完成。
2. **`BrowserWindow.setBounds` 只在"状态转换瞬间"调用，绝不在动画过程中重复调用。** 一次动画生命周期内 `setBounds` 调用次数必须 ≤ 2（入口各一次）。
3. **固定模式拖拽期间不改原生窗口几何。** mousemove / RAF 期间只改 CSS；`BrowserWindow.setBounds` 与 `WebContentsView.setBounds` 只在 mouseup 时提交一次。
4. **WebContentsView 不参与 CSS 动画。** 它是原生 View，不支持 opacity / transform。动画期间通过 `setBounds` 到 `(0,0,0,0)` "隐藏"它。
5. **Dock 窗口一旦定位，生命周期内不再 `setBounds`**。唯一例外：用户切换贴边方向、屏幕分辨率/DPI 变化、任务栏位置变化。

#### 5.14.2 架构前提（窗口拆分）

必须保留**两个核心交互 BrowserWindow**，且不得合并：

| 窗口 | 职责 | 创建时机 | 销毁时机 |
|---|---|---|---|
| `DockWindow` | 图标栏。始终可见。`frame: false, transparent: false, skipTaskbar: true, alwaysOnTop: 'screen-saver'` | 应用启动 | 应用退出 |
| `PanelWindow` | 面板 chrome（标题栏 + 地址栏）+ WebContentsView 容器。`frame: false, transparent: true, show: false, skipTaskbar: true, alwaysOnTop: 'screen-saver'` | 应用启动 | 应用退出 |

**允许辅助窗口**：
- `PanelAnimationWindow`：非交互动画快照层，只负责视觉过渡
- `PanelMenuWindow`：标题栏三点菜单的独立顶层窗口
- 这类辅助窗口不改变 Dock 与 Panel 的主责任边界，但可用于解决 Electron 分层、透明窗口和顶层菜单问题

**PanelWindow 初始化配置**：
- `bounds` 一次性设置为"面板完全展开态"的最终位置和宽度（贴 Dock 内侧，高 = 显示器工作区高）
- 启动后立即 `setIgnoreMouseEvents(true, { forward: true })`，让鼠标穿透到下面的桌面
- 之后**永远不调用 `setBounds`**，除非：① 用户切换贴边方向；② 用户提交拖拽改宽度（仅 mouseup 时）；③ DPI/分辨率变化
- 渲染进程根部 `<html>` 背景透明，面板 chrome 用 `position: fixed; right: 0`（或 `left: 0`）+ `transform: translateX(...)` 做滑动

#### 5.14.3 正确时序：三个关键场景

##### 场景 A — 展开面板（从无到有）

```
主进程                           渲染进程（panel-animation）    渲染进程（panel-chrome）      WebContentsView
─────                           ───────────────────────────    ─────────────────────────      ──────────────
1. setIgnoreMouseEvents(false)
2. IPC: panel-animation:open ─▶ 3. 动画快照层开始 150ms 展开
4. 主进程等待 170ms
5. IPC: panel:animate-in ───────────────────────────────────▶  6. 标题栏 / 地址栏进入最终态
7. addChildView(view) ───────────────────────────────────────────────────────────────────────▶
8. view.setBounds({x:0, y:CHROME_H, w:panelW, h:windowH-CHROME_H})
9. panelAnimationWindow.reset() ─▶ 10. 动画快照层复位隐藏
```

**关键**：v1 的展开是**两阶段交接**。第一阶段由独立的 `PanelAnimationWindow` 负责快照层滑出；第二阶段才由 `PanelWindow` 接手真实 chrome 与 WebContentsView。这样可以避免透明窗口、标题栏和网页内容在同一阶段争抢层级与时序，减少双层动画与缩放错觉。

**代码模板**（`PanelManager.showPanel`）：

```typescript
async showPanel(panelId: string): Promise<void> {
  if (this.currentPanelId === panelId && this.state === 'open') return;
  
  this.cancelCloseTimer();
  this.state = 'opening';
  this.currentPanelId = panelId;
  
  // 1. 让窗口接受鼠标
  this.panelWindow.setIgnoreMouseEvents(false);
  
  // 2. 先让 animation window 播放快照层展开
  this.animationWindow.webContents.send('panel-animation:open', {
    panelId,
    descriptor: this.registry.get(panelId),
  });
  
  // 3. 等动画结束（170ms = 150ms 动画 + 20ms 缓冲）
  await sleep(170);
  if (this.state !== 'opening' || this.currentPanelId !== panelId) return; // 被打断
  
  // 4. 再切入真实 panel chrome
  this.panelWindow.webContents.send('panel:animate-in', {
    panelId,
    descriptor: this.registry.get(panelId),
  });

  // 5. Attach WebContentsView + setBounds 一次到位
  if (this.registry.get(panelId).type === 'web') {
    const view = await this.webPanelHost.getOrCreateView(panelId);
    if (!this.panelWindow.contentView.children.includes(view)) {
      this.panelWindow.contentView.addChildView(view);
    }
    const [w, h] = this.panelWindow.getContentSize();
    view.setBounds({ x: 0, y: CHROME_HEIGHT, width: w, height: h - CHROME_HEIGHT });
  }

  // 6. 动画层复位
  this.animationWindow.webContents.send('panel-animation:reset');
  
  this.state = 'open';
}
```

##### 场景 B — 收起面板（从有到无）

**必须先藏 view，再跑 chrome 退出动画。** 否则用户看到的是"页面内容停在原位、标题栏自己滑走"。

```typescript
async hidePanel(): Promise<void> {
  if (this.state === 'closed' || this.state === 'closing') return;
  
  this.state = 'closing';
  
  // 1. 先把 WebContentsView 缩到 0（瞬时，用户感知不到）
  const view = this.webPanelHost.getView(this.currentPanelId);
  if (view) view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  
  // 2. 通知 chrome 播放退出动画
  this.panelWindow.webContents.send('panel:animate-out');
  
  // 3. 等动画
  await sleep(170);
  if (this.state !== 'closing') return; // 被打断（用户又回来了）
  
  // 4. 恢复鼠标穿透
  this.panelWindow.setIgnoreMouseEvents(true, { forward: true });
  
  // 5. 按需销毁 view（仅"关闭"按钮触发，"最小化"/悬停关闭不销毁）
  if (this.pendingDestroyId) {
    this.webPanelHost.destroyView(this.pendingDestroyId);
    this.pendingDestroyId = null;
  }
  
  this.state = 'closed';
  this.currentPanelId = null;
}
```

##### 场景 C — 跨图标切换（A → B）

**各调用一次 setBounds：旧 view 收走、新 view 贴上。chrome 用 opacity 100ms 淡入替换标题/URL 文本。**

```typescript
async switchPanel(toPanelId: string): Promise<void> {
  const token = ++this.switchToken; // 用于合并快速连续调用
  
  // 1. 先让标题栏开始淡出（渲染进程自己处理 100ms opacity）
  this.panelWindow.webContents.send('chrome:fade-out');
  await sleep(60);
  if (token !== this.switchToken) return; // 被新的 switch 调用打断
  
  // 2. 旧 view 瞬时消失
  const oldView = this.webPanelHost.getView(this.currentPanelId);
  if (oldView) oldView.setBounds({ x: 0, y: 0, width: 0, height: 0 });
  
  // 3. 新 view 贴上（若不存在则创建，首次加载可能有空白，属正常）
  const newView = await this.webPanelHost.getOrCreateView(toPanelId);
  if (!this.panelWindow.contentView.children.includes(newView)) {
    this.panelWindow.contentView.addChildView(newView);
  }
  const [w, h] = this.panelWindow.getContentSize();
  newView.setBounds({ x: 0, y: CHROME_HEIGHT, width: w, height: h - CHROME_HEIGHT });
  
  // 4. 通知渲染进程用新描述符重绘 chrome 并淡入
  this.panelWindow.webContents.send('chrome:fade-in', {
    descriptor: this.registry.get(toPanelId),
  });
  
  this.currentPanelId = toPanelId;
}
```

##### 场景 D — 固定模式拖拽改宽度

**这是最容易出大问题的场景。口诀：拖拽期间只改 CSS，mouseup 才改窗口。**

**渲染进程**（`ResizeHandle.tsx`）：

```typescript
// 拖拽句柄组件
const ResizeHandle: React.FC = () => {
  const edge = useConfig(s => s.layout.edge); // 'left' | 'right'
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);
  
  const onMouseDown = (e: React.MouseEvent) => {
    startX.current = e.screenX;
    startWidth.current = document.querySelector<HTMLElement>('.panel-chrome')!.offsetWidth;
    setDragging(true);
    
    const onMove = (ev: MouseEvent) => {
      const delta = edge === 'right' ? startX.current - ev.screenX : ev.screenX - startX.current;
      const newW = Math.min(Math.max(startWidth.current + delta, 320), window.screen.width * 0.5);
      // ✅ 只改 CSS
      document.querySelector<HTMLElement>('.panel-chrome')!.style.width = `${newW}px`;
    };
    
    const onUp = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const finalW = document.querySelector<HTMLElement>('.panel-chrome')!.offsetWidth;
      setDragging(false);
      // ✅ 只在 mouseup 时提交
      window.panelAPI.commitResize(finalW);
    };
    
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
  
  return <div className="resize-handle" onMouseDown={onMouseDown} />;
};
```

**主进程**（`panelHandlers.ts`）：

```typescript
ipcMain.handle('panel:commit-resize', async (_e, newWidth: number) => {
  const edge = configStore.get().layout.edge;
  const display = screen.getDisplayNearestPoint(screen.getCursorScreenPoint());
  const { x: wx, y: wy, width: ww, height: wh } = display.workArea;
  
  const bounds = edge === 'right'
    ? { x: wx + ww - DOCK_WIDTH - newWidth, y: wy, width: newWidth, height: wh }
    : { x: wx + DOCK_WIDTH,                  y: wy, width: newWidth, height: wh };
  
  // 按顺序一次性执行（同一事件循环内）
  panelWindow.setBounds(bounds);
  const view = webPanelHost.getView(currentPanelId);
  if (view) view.setBounds({ x: 0, y: CHROME_HEIGHT, width: newWidth, height: wh - CHROME_HEIGHT });
  
  configStore.update({ layout: { panelDefaultWidth: newWidth } });
});
```

**视觉解释**：拖拽时 chrome 实时变宽（流畅），WebContentsView 停在旧宽度（看起来像"chrome 拉出一块新白区"）；mouseup 瞬间 view 与窗口对齐新宽度（< 16ms，人眼不可见跳跃）。**比每帧调用流畅 100 倍**。

#### 5.14.4 防抖与合并

**①  悬停意图（hover-intent）**

鼠标快速掠过多个图标时不能每个都触发。实现方式：

```typescript
// 渲染进程 Dock
const HOVER_DELAY = 200;
let hoverTimer: number | null = null;
let pendingId: string | null = null;

function onIconEnter(id: string) {
  if (hoverTimer) clearTimeout(hoverTimer);
  pendingId = id;
  hoverTimer = window.setTimeout(() => {
    if (pendingId === id) window.dockAPI.showPanel(id);
  }, HOVER_DELAY);
}

function onIconLeave(id: string) {
  if (pendingId === id) {
    pendingId = null;
    if (hoverTimer) { clearTimeout(hoverTimer); hoverTimer = null; }
  }
  // 注意：这里不直接 hidePanel，关闭逻辑看整体 hover 状态
}
```

**② 切换合并（switch-token）**

用户快速划过 A→B→C→D 时，前几个切换要被丢弃。`PanelManager` 中维护 `switchToken`，每次 `switchPanel` 调用 `++switchToken` 并在 await 后核对，不符则放弃（见场景 C 代码）。

**③ 关闭延迟与打断**

鼠标离开触发 300ms 计时器 → 进入 closing 状态。如果 300ms 内鼠标回到 Dock 或 Panel 区域，**取消计时器，状态回退到 open，不重播动画**。

鼠标进入"Dock + Panel 合并区域"的判定：优先使用 Dock / Panel / Menu 的 `mouseenter` / `mouseleave` 上报；若 `WebContentsView` 承载站点导致事件丢失，允许主进程以 60–100ms 轮询 `screen.getCursorScreenPoint()` 作为兜底。不要用 `setCapture` / 全局鼠标钩子（复杂度不值）。

#### 5.14.5 显示器与 DPI 变化

- 监听 `screen.on('display-metrics-changed')` 和 `screen.on('display-added' / 'display-removed')`
- 事件触发时：
  1. 若面板当前展开 → 先 `hidePanel()`
  2. 重新计算 Dock 和 PanelWindow 的目标 bounds（基于新的 `workArea`）
  3. 各自一次性 `setBounds`
  4. 若之前处于固定模式 → 重新应用固定态宽度与展开方向

**DPI 变化（`display-metrics-changed` 带 `scaleFactor` 字段）** 同上处理。

#### 5.14.6 GPU 合成与透明窗口性能

透明窗口（PanelWindow）的 CSS 动画在某些 GPU 驱动（尤其是 Intel HD 老卡 + Win10）下会卡顿。强制启用硬件合成层：

```css
.panel-chrome {
  will-change: transform, opacity;
  backface-visibility: hidden;
  transform: translateX(100%) translateZ(0); /* translateZ 强制 compositor 层 */
  transition: transform 150ms cubic-bezier(0.2, 0, 0, 1);
}
.panel-chrome.open {
  transform: translateX(0) translateZ(0);
}
```

若仍卡顿（极少数用户机型），设置里提供"减少动画"开关（v1 不做，v2 再加）。

#### 5.14.7 反模式清单（Codex 必须避免）

| ❌ 反模式 | ✅ 正确做法 |
|---|---|
| 用 `setBounds` 做滑动动画 | CSS `transform` 动画 |
| 动画期间每帧调用 `setBounds` | 动画前后各调用一次 `setBounds` |
| mousemove 调用原生窗口几何更新 | mouseup 才调用 |
| 动画期间 WebContentsView 停留在正确位置 | 动画期间 view 收到 `(0,0,0,0)`，结束后回到正确位置 |
| Dock 和 Panel 合并成一个 BrowserWindow | Dock / Panel 保持独立，辅助窗口按需存在 |
| 切换面板时销毁旧 view、创建新 view | 两个 view 都常驻，只 `setBounds` 切换可见性 |
| 在 window 收到 `resize` 事件时调用 `setBounds` | 禁止——会造成反馈循环 |
| 用 `requestAnimationFrame` 轮询窗口位置 | 用 `screen.on('display-metrics-changed')` 事件 |

#### 5.14.8 调试建议

当出现抖动问题时，按以下顺序排查：

1. **开启窗口位置日志**：在 `PanelWindow.on('move' / 'resize')` 里打印 bounds 和当前调用栈。若每秒超过 5 条日志 = 有地方在死循环调用 `setBounds`
2. **检查 WebContentsView 的 `setBounds` 调用频率**：同样每秒超过 5 次大概率有问题
3. **检查固定模式拖拽提交次数**：一次拖拽只应在 mouseup 时提交一次 `setBounds`
4. **Windows Spy++** 或 **AccEvent** 观察窗口消息队列，若 `WM_WINDOWPOSCHANGED` 在拖拽时狂刷 = 每帧 `setBounds` 没改掉

---



### 6.1 色板

| 角色 | HEX | 用途 |
|---|---|---|
| 背景深 | `#1F1F1F` | Dock 背景、面板外框背景 |
| 背景浅 | `#2D2D2D` | 菜单、卡片 |
| 背景强调 | `#383838` | 输入框背景 |
| 前景主 | `#FFFFFF` | 标题、重要文字 |
| 前景次 | `#B0B0B0` | URL、次要文字 |
| 前景弱 | `#6B6B6B` | 占位符、禁用文字 |
| 强调主 | `#4CC2FF` | 激活指示条、主按钮 |
| 强调主 hover | `#79CEFF` | 主按钮 hover |
| 危险 | `#F1707A` | 删除确认按钮 |
| 分隔线 | `rgba(255,255,255,0.08)` | 菜单分隔线 |
| Hover 叠加 | `rgba(255,255,255,0.08)` | 图标/菜单项 hover |
| 激活叠加 | `rgba(255,255,255,0.12)` | 图标激活 |

### 6.2 字体

- 优先级：`"Segoe UI Variable Display", "Microsoft YaHei UI", system-ui, sans-serif`
- 标题栏站点名：14px / weight 600
- 地址栏：12px / weight 400
- 菜单项：13px / weight 400
- 按钮：13px / weight 500

### 6.3 间距

- 图标栏图标尺寸：28px
- 图标栏容器高度：44px
- 面板标题栏高度：40px
- 面板地址栏高度：28px
- 按钮点击区：≥ 32×32px
- 圆角：菜单/卡片 8px，按钮 6px，输入框 6px

### 6.4 动画

| 对象 | 时长 | 缓动 |
|---|---|---|
| 面板展开 | 150ms | `cubic-bezier(0.2, 0, 0, 1)` |
| 面板收起 | 150ms | `cubic-bezier(0.4, 0, 1, 1)` |
| 宽度过渡 | 150ms | `ease-in-out` |
| 图标 hover | 100ms | `ease` |
| Dock 滚动 | 150ms | `ease-out` |
| 添加图标脉冲 | 500ms | `ease-out` |
| 拖拽排序重排 | 150ms | `ease-out` |

---

## 7. Windows 平台集成

### 7.1 浏览器检测（`BrowserService`）

**扫描路径**：
1. `HKLM\SOFTWARE\Clients\StartMenuInternet` 下所有子键
2. 每个子键读取 `\shell\open\command` 的默认值获取 EXE 路径
3. 同时读取 `HKCU\...\Shell\Associations\UrlAssociations\http\UserChoice\ProgId` 获取系统默认浏览器

**输出**：
```typescript
interface BrowserInfo {
  id: string;                // 规范化 ID（如 'chrome' / 'msedge' / 'firefox'）
  name: string;              // 显示名
  path?: string;             // 完整路径，'system' 项为空
  isDefault?: boolean;       // 是否系统默认
}
```

**特殊项**：列表第一项始终为 `{ id: 'system', name: '系统默认浏览器（推荐）', isDefault: true }`，选择它时用 `shell.openExternal(url)`。

**打开命令**：
- `id === 'system'` → `shell.openExternal(url)`
- 其他 → `child_process.spawn(path, [url], { detached: true })`
- EXE 路径已失效 → 日志 WARN + 回退到系统默认 + 托盘气泡 "[浏览器名] 已卸载，已回退到系统默认浏览器"

### 7.2 Favicon 获取（`FaviconService`）

**优先级**（`getFavicon(url): Promise<Buffer>`）：
1. 用户手动上传的图标（存在则直接返回）
2. 抓取站点 HTML，解析 `<link rel="icon">`、`<link rel="apple-touch-icon">`，取 `sizes` 最大的
3. `<origin>/favicon.ico`
4. `https://www.google.com/s2/favicons?domain=<domain>&sz=128`
5. 生成字母占位图标（Canvas 绘制，随机柔和背景色 + 白色首字母，64×64 PNG）

**缓存**：
- 抓取成功后存入 `cache/favicons/<domain>.png`
- 缓存 7 天，过期重新抓
- 所有图标统一缩放为 64×64 PNG 再返回

**实现**：使用 Electron `net` 模块发起请求，`sharp` 做图片处理（⚠️ sharp 需要预编译二进制，在 `package.json` 的 `build.asarUnpack` 中包含）。

### 7.3 开机自启（`AutoLaunchService`）
封装 `auto-launch`：
```typescript
const autoLauncher = new AutoLaunch({
  name: 'SideBar Plus',
  path: process.execPath,
  isHidden: true,  // 附加 --autostart 不依赖此参数，另外写注册表
});
```

**处理 `--autostart` 参数**：`app.on('ready')` 时若 `process.argv.includes('--autostart')`，跳过欢迎弹窗之类的首次 UI。

---

## 8. 项目结构

```
sidebar-plus/
├── package.json
├── electron.vite.config.ts
├── electron-builder.yml
├── tsconfig.json
├── tsconfig.node.json
├── tailwind.config.js
├── postcss.config.js
├── .eslintrc.cjs
├── .prettierrc
├── .gitignore
├── README.md
│
├── resources/
│   ├── icon.ico                # 应用图标（v1 占位，后续替换）
│   ├── icon.png                # 512x512
│   └── installer/
│       └── license.txt
│
├── src/
│   ├── main/                           # 主进程
│   │   ├── index.ts                    # 入口
│   │   ├── windows/
│   │   │   ├── DockWindow.ts
│   │   │   ├── PanelWindow.ts
│   │   │   ├── PanelAnimationWindow.ts # 可选辅助窗口
│   │   │   ├── PanelMenuWindow.ts      # 可选辅助窗口
│   │   │   └── WindowManager.ts
│   │   ├── panels/
│   │   │   ├── PanelManager.ts         # 面板调度中枢
│   │   │   ├── WebPanelHost.ts         # 管理 WebContentsView 生命周期
│   │   │   └── BuiltinPanelHost.ts     # 可选，若内置面板逻辑需要进一步拆分
│   │   ├── store/
│   │   │   ├── ConfigStore.ts
│   │   │   └── migrations/
│   │   │       └── index.ts            # schemaVersion 迁移（v1 为空）
│   │   ├── services/
│   │   │   ├── FaviconService.ts
│   │   │   ├── BrowserService.ts
│   │   │   ├── AutoLaunchService.ts
│   │   │   ├── FullscreenDetector.ts
│   │   │   └── UpdateChecker.ts        # 从 GitHub Releases 获取最新 tag
│   │   ├── tray/
│   │   │   └── TrayManager.ts
│   │   ├── ipc/
│   │   │   ├── index.ts                # 注册所有 handler
│   │   │   ├── configHandlers.ts
│   │   │   ├── panelHandlers.ts
│   │   │   ├── dockHandlers.ts
│   │   │   ├── appHandlers.ts
│   │   │   ├── browserHandlers.ts
│   │   │   └── faviconHandlers.ts
│   │   └── utils/
│   │       ├── singleton.ts
│   │       ├── paths.ts
│   │       ├── logger.ts
│   │       └── display.ts              # 屏幕/工作区计算
│   │
│   ├── preload/
│   │   ├── dock.ts
│   │   ├── panel.ts
│   │   └── builtin.ts
│   │
│   ├── renderer/
│   │   ├── dock/                       # Dock 窗口 UI
│   │   │   ├── index.html
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   │   ├── DockItem.tsx
│   │   │   │   ├── DockIconList.tsx
│   │   │   │   ├── DockFooter.tsx       # + ⋮ × 三按钮
│   │   │   │   ├── QuickMenu.tsx        # ⋮ 弹出菜单
│   │   │   │   └── DraggableList.tsx
│   │   │   └── hooks/
│   │   │       ├── useHoverIntent.ts
│   │   │       └── useDragReorder.ts
│   │   │
│   │   ├── panel-chrome/                # 面板标题栏 UI + 内置面板渲染
│   │   │   ├── index.html
│   │   │   ├── main.tsx
│   │   │   ├── App.tsx
│   │   │   ├── components/
│   │   │   │   ├── TitleBar.tsx
│   │   │   │   ├── AddressBar.tsx
│   │   │   │   ├── TitleBarMenu.tsx     # [⋮] 弹出菜单
│   │   │   │   └── ResizeHandle.tsx     # 固定模式下的拖拽条
│   │   │
│   │   ├── panel-menu/                  # 标题栏三点菜单独立窗口
│   │   │   ├── index.html
│   │   │   ├── main.tsx
│   │   │   └── App.tsx
│   │   │
│   │   ├── panel-animation/             # 动画快照层独立窗口
│   │   │   ├── index.html
│   │   │   ├── main.tsx
│   │   │   └── App.tsx
│   │   │
│   │   └── shared/                      # 渲染层共享
│   │       ├── styles/
│   │       │   └── global.css           # Tailwind 导入 + 全局变量
│   │       ├── components/
│   │       │   ├── Button.tsx
│   │       │   ├── Switch.tsx
│   │       │   ├── Slider.tsx
│   │       │   ├── Select.tsx
│   │       │   ├── Input.tsx
│   │       │   ├── Menu.tsx
│   │       │   └── Tooltip.tsx
│   │       └── hooks/
│   │           └── useConfig.ts
│   │
│   └── shared/                          # 主/渲染共享
│       ├── types.ts                     # 所有 TypeScript 类型
│       ├── constants.ts                 # 常量（尺寸、动画时长、色值 key）
│       ├── ipc-contracts.ts             # IPC channel 名 + payload 类型
│       └── i18n/
│           └── zh-CN.json
│
├── scripts/
│   └── postinstall.js                   # 下载 sharp 二进制等
│
└── dist/                                # 构建产物（gitignore）
```

---

## 9. 依赖清单（package.json 摘要）

```json
{
  "name": "sidebar-plus",
  "version": "1.0.0",
  "main": "./out/main/index.js",
  "scripts": {
    "dev": "electron-vite dev",
    "build": "tsc --noEmit && electron-vite build",
    "build:win": "npm run build && electron-builder --win",
    "postinstall": "electron-builder install-app-deps",
    "typecheck": "tsc --noEmit",
    "lint": "eslint . --ext .ts,.tsx"
  },
  "dependencies": {
    "auto-launch": "^5.0.6",
    "electron-log": "^5.2.0",
    "nanoid": "^5.0.0",
    "sharp": "^0.33.0",
    "zustand": "^5.0.0"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "@types/react": "^18.3.0",
    "@types/react-dom": "^18.3.0",
    "@types/auto-launch": "^5.0.0",
    "@vitejs/plugin-react": "^4.3.0",
    "autoprefixer": "^10.4.0",
    "electron": "^34.0.0",
    "electron-builder": "^25.0.0",
    "electron-vite": "^3.0.0",
    "eslint": "^9.0.0",
    "eslint-plugin-react": "^7.36.0",
    "lucide-react": "^0.460.0",
    "postcss": "^8.4.0",
    "prettier": "^3.3.0",
    "react": "^18.3.0",
    "react-dom": "^18.3.0",
    "tailwindcss": "^3.4.0",
    "typescript": "^5.4.0",
    "vite": "^5.4.0"
  }
}
```

---

## 10. 构建与打包

### 10.1 开发命令
```bash
npm install
npm run dev          # 启动开发（HMR）
npm run typecheck    # 类型检查
npm run build        # 编译全部进程
npm run build:win    # 打包为 NSIS 安装器
```

### 10.2 electron-builder.yml

```yaml
appId: com.sidebarplus.app
productName: SideBar Plus
copyright: Copyright © 2026
directories:
  buildResources: resources
  output: dist
files:
  - out/**/*
  - '!**/node_modules/*/{CHANGELOG.md,README.md,README,readme.md,readme}'
  - '!**/node_modules/*/{test,__tests__,tests,powered-test,example,examples}'
asarUnpack:
  - '**/node_modules/sharp/**'
  - '**/node_modules/@img/**'
win:
  target:
    - target: nsis
      arch: [x64]
  icon: resources/icon.ico
  requestedExecutionLevel: asInvoker     # 不需要管理员
nsis:
  oneClick: false
  perMachine: false                       # 安装到 %LOCALAPPDATA%
  allowToChangeInstallationDirectory: true
  installerIcon: resources/icon.ico
  uninstallerIcon: resources/icon.ico
  shortcutName: SideBar Plus
  createDesktopShortcut: true
  createStartMenuShortcut: true
  license: resources/installer/license.txt
```

### 10.3 安装路径
- 默认：`%LOCALAPPDATA%\Programs\SideBar Plus\`
- 不需要管理员权限
- 首次安装完成后勾选"立即启动"

---

## 11. 开发里程碑

**按顺序实现，每阶段均有可演示产出：**

### M1 — 基础骨架（1）
- 项目脚手架搭建（electron-vite + React + Tailwind + TS）
- 主进程、Dock 渲染进程、Panel 渲染进程三路启动
- ConfigStore 读写 config.json
- 日志基础设施
- **验收**：应用能启动，Dock 显示为黑色 44px 纵条贴在屏幕右侧

### M2 — Dock 与静态图标（2）
- Dock 渲染 React 组件
- 读取配置中的 panels 数组，渲染图标列表（含 favicon 异步加载）
- 底部 + / ⋮ / × 按钮渲染
- ⋮ 弹出菜单（自动启动开关、设置、关于）
- × 按钮隐藏 Dock 到托盘 + 托盘恢复
- **验收**：能从 config.json 手工写入几个站点，Dock 正确渲染图标

### M3 — 悬停面板（3）
- PanelWindow 实现
- 悬停触发、离开关闭、粘性逻辑、跨图标无缝切换
- WebContentsView 创建与切换
- 标题栏 UI（标题 + 地址栏 + 5 个按钮）
- 面板展开/收起动画
- **验收**：悬停图标能打开网站，交互流畅

### M4 — 标题栏功能 + Web 行为（2）
- [↗] 外开按钮
- [⋮] 三点菜单（刷新 / 复制链接 / 显示移动视图 / 推迟通知/取消推迟通知）
- [–] 最小化 / [×] 关闭（销毁 WebContentsView）
- `setWindowOpenHandler` 链接拦截
- 下载 + 通知
- 缩放记忆
- **验收**：所有标题栏按钮按规格工作

### M5 — 添加与管理站点（2）
- "添加网页"内置面板 UI
- FaviconService 完整实现
- BrowserService 扫描系统浏览器
- 自定义图标上传
- 右键 Dock 图标移除
- 拖拽排序
- 溢出滚轮滚动
- **验收**：能添加、管理、重排站点

### M6 — 固定模式（Pinned Surface）（2）
- 📌 按钮切换固定态
- 边缘拖拽改宽度
- 固定态切站点 / 打开内置面板
- **验收**：固定后面板常驻可见，切换图标不退出固定态，拖拽改宽度成功

### M7 — 系统集成（2）
- 开机自启（含 --autostart 参数）
- 单实例锁
- 全屏检测
- 左右贴边切换
- **验收**：开机自动启动进托盘，全屏游戏时自动隐藏

### M8 — 设置面板（2）
- 设置内置面板 UI
- 所有配置项绑定
- 导入/导出配置
- 检查更新
- **验收**：所有设置项生效，持久化正确

### M9 — 打包与安装（1）
- NSIS 安装器配置
- Icon 资源整合
- 首次运行体验
- **验收**：产出 `.exe` 安装包，能在干净的 Win10 / Win11 机器上安装运行

**总计：约 18 人日**

---

## 12. 验收 Checklist

### 12.1 功能
- [ ] Dock 贴屏幕右侧，宽 44px，黑色不透明
- [ ] 左右贴边切换生效
- [ ] 站点图标渲染（favicon 自动 / 手动上传 / 字母兜底）
- [ ] 悬停 200ms 后面板打开，动画 150ms
- [ ] 鼠标移出 300ms 后面板关闭
- [ ] 点击面板后变粘性，鼠标移出不关闭
- [ ] 跨图标切换时面板内容无缝替换
- [ ] `+` 悬停打开"添加网页"面板
- [ ] 添加网站后图标出现脉冲动画
- [ ] 拖拽排序生效
- [ ] 溢出时鼠标滚轮滚动
- [ ] 右键图标 → 从边栏取消固定
- [ ] 标题栏所有 5 个按钮按规格工作
- [ ] 三点菜单 7 个项按规格工作
- [ ] 固定模式下常驻展示且不自动收起
- [ ] 固定模式下切换图标不退出固定态
- [ ] 固定模式下边缘拖拽改宽度
- [ ] 链接打开规则正确（内部导航 vs 外部浏览器）
- [ ] 下载跳转到系统默认下载目录
- [ ] 通知权限默认允许
- [ ] `keepAudioOnHide` 开关生效
- [ ] 缩放记忆持久化
- [ ] 开机自启 → 托盘直接出现
- [ ] 单实例：双击桌面图标激活已运行实例
- [ ] 全屏游戏时 Dock 自动隐藏
- [ ] 设置所有项读写持久化
- [ ] 配置文件导入导出
- [ ] 检查更新能获取 GitHub 最新 tag

### 12.2 兼容性
- [ ] Windows 10 1809 及以上可安装运行
- [ ] Windows 11 可安装运行
- [ ] DPI 100% / 125% / 150% / 200% 显示正常
- [ ] 主显示器工作区正确识别（任务栏位置变化后 Dock 位置正确）

### 12.3 性能
- [ ] 空载内存占用 < 300 MB
- [ ] 单站点 WebContentsView 创建 < 500ms
- [ ] 悬停响应延迟 ≤ 设定值 ± 30ms
- [ ] 面板切换无卡顿

### 12.4 稳定性
- [ ] 连续运行 24 小时无崩溃
- [ ] 大量添加站点（30+）性能无明显下降
- [ ] 配置文件损坏时自动回退备份

---

## 13. 已知风险与缓解

| 风险 | 缓解 |
|---|---|
| sharp 预编译二进制体积 | `asarUnpack` 配置 + 首次启动后台预热 |
| 固定模式与贴边/多屏切换的几何同步 | M6 阶段专项测试；所有宽度提交只在 mouseup 落地，切边前先退出固定 |
| 页面内 iframe 弹窗 | `setWindowOpenHandler` 已覆盖绝大多数场景，个别站点可能行为异常，v1 观察 |
| 未签名安装器触发 SmartScreen | README 提供"更多信息 → 仍要运行"引导截图 |
| 某些站点检测 iframe/WebView 拒绝访问 | `BrowserWindow.webPreferences.webviewTag = false`，统一用 WebContentsView；UA 保持真实 Chrome 样式 |
| Favicon 抓取被反爬 | 三级回退链 + Google s2 兜底 + 字母兜底 |

---

## 14. 扩展性（v2 预留）

### 14.1 本地小工具面板
`PanelDescriptor.type = 'builtin'` 的扩展通道已就位。v2 新增 Widget 时：
1. 在 `src/renderer/` 新增目录（如 `widgets/calculator/`）
2. 在 `BuiltinPanelHost` 注册 `widgetId → entryPath` 映射
3. 在"添加"面板中新增"内置小工具"选项
4. 其余架构无需改动

### 14.2 多 Profile（多账号）
`WebPanelConfig.partition` 字段已预留，v2 暴露 UI 允许用户为不同站点指定独立 session。

### 14.3 多语言
所有字符串通过 `shared/i18n/<locale>.json` 读取，v2 新增 `en.json` 即可。

### 14.4 自动更新
v1 仅手动检查更新。v2 可接入 `electron-updater` + 购买代码签名证书。

---

## 15. 附录 A：UI 参考截图说明

> 以下引用在对话中由产品负责人提供的 7 张截图，按图索骥即可。Codex 实现时应像素级参考。

| 图号 | 用途 |
|---|---|
| 图 1 | Dock 整体布局、图标间距、底部 +/⋮/× 布局 |
| 图 2 | 底部 ⋮ 弹出菜单（3 项） |
| 图 3 | 标题栏 `↗` 按钮 tooltip "在新选项卡中打开链接" |
| 图 4 | 标题栏 `⋮` 弹出菜单 |
| 图 5 | 标题栏 `📌` tooltip "固定侧窗格" |
| 图 6 | 标题栏 `–` tooltip "最小化 [站点名] 窗格" |
| 图 7 | 标题栏 `×` tooltip "关闭 [站点名] 窗格" |
| 附加图 | "添加网页"内置面板完整布局 |

---

## 16. 附录 B：开发执行指南（给 Codex）

**执行原则**：
1. **严格按 M1→M9 顺序**推进，每完成一个里程碑运行验收 checklist
2. **新增第三方库时**优先使用本 PRD 第 9 节列出的；不在列表中的须先写明原因
3. **不得跨阶段合并代码**（例如在 M2 阶段提前写固定模式相关代码）
4. **每个模块先写类型（shared/types.ts + shared/ipc-contracts.ts）再写实现**
5. **IPC handler 必须包一层 try/catch**，错误返回结构化对象 `{ ok: false, error: string }`
6. **主进程所有文件 I/O 走 async，Config 写入必须采用 Windows 兼容的安全替换流程**（temp + replace/rename，不得出现先删主文件再留下空窗期）
7. **渲染进程不直接操作 fs**，一律经 IPC
8. **遇到与 PRD 不符的需求或歧义**，立即停止并向产品负责人确认，不自行决策

**🚫 动画与窗口管理硬性规定（违反将导致"乱跳"、返工成本极高，Codex 必须严格遵守）**：

9. **禁止用 `BrowserWindow.setBounds` 做动画**。滑入/滑出/宽度过渡一律用 CSS `transform` / `width` 完成。`setBounds` 每次动画生命周期内调用次数 ≤ 2（入口各一次）。
10. **禁止在 mousemove / RAF 循环中提交原生窗口几何更新**。拖拽改宽度时，mousemove 只改 CSS；`BrowserWindow.setBounds` 和 `WebContentsView.setBounds` 只在 mouseup 时提交。
11. **Dock 窗口和 Panel 窗口必须保持独立**。允许存在 `PanelAnimationWindow`、`PanelMenuWindow` 等辅助窗口，但不得让它们承担核心交互职责。Dock 一旦定位后，整个应用生命周期不再频繁调用 `setBounds`（例外仅限切换贴边方向 / DPI 变化 / 屏幕分辨率变化 / 固定模式宽度提交）。
12. **WebContentsView 不参与 CSS 动画**。动画期间它通过 `setBounds({x:0,y:0,width:0,height:0})` "隐藏"，动画结束后一次性 `setBounds` 到最终位置。绝不能让它留在原位跟着窗口动画走。
13. **必须精读 §5.14**。M3、M4、M6 阶段开工前完整阅读该章节并按其中的代码模板实现。该章节的 8 个反模式清单是底线，任何违反需要书面理由并由产品负责人批准。

**关键提示**：
- WebContentsView（Electron 30+ 新 API）替代旧的 BrowserView，注意使用 `contentView.addChildView()`
- 标题栏菜单如出现层级问题，优先使用独立顶层菜单窗口，而不是强行下移或把菜单塞进 WebContentsView 层级里
- **调试窗口抖动**：在 `BrowserWindow.on('move'|'resize')` 里打印日志；正常拖拽一次 resize 只应在提交时出现 1 条有效变更日志，若每秒 > 5 条必定是错误的循环调用

---

**文档结束**

变更历史：
- 2026-04-17 v1.0 初稿（基于 UI 截图与 7 轮需求对齐）
- 2026-04-17 v1.1 新增 §5.14 窗口与动画工程准则（含反模式清单与代码模板）；在 §5.4、§5.7.3 加交叉引用；在 §16 加 5 条硬性规定 #9–#13
