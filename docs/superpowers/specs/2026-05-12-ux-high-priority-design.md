# UX 高优先级优化设计

**日期**：2026-05-12
**范围**：3 个独立小改动——site-info 超时、favicon 重试、禁用按钮视觉

---

## 背景

来自 UX 审计的高优先级问题（已跳过进度条标签）：
- Issue 2：`getSiteInfo` 无超时，网络慢时用户永久等待
- Issue 4：favicon 获取失败后无重试入口，用户必须进编辑页手动换图标
- Issue 5：提交按钮禁用态 `opacity-30` 太淡，视觉区分度不足

---

## 设计

### Issue 2：site-info 超时处理

**文件**：`src/renderer/panel-chrome/App.tsx`（约第 274 行）

`getSiteInfo` 调用加 10s 超时，用 `Promise.race` 竞争：

```ts
const result = await Promise.race([
  window.panelAPI.getSiteInfo({ panelId: targetPanel.id }),
  new Promise<never>((_, reject) =>
    setTimeout(() => reject(new Error('加载超时')), 10000)
  )
]).catch((e: Error) => ({ ok: false as const, error: e.message }));
```

超时后走现有 `setSiteInfoError(result.error)` 路径，显示「加载超时」。无新增 UI。

---

### Issue 4：点击图标区域重试 favicon

**文件**：`src/renderer/panel-chrome/App.tsx`（约第 795-813 行）

**触发条件**：`faviconError !== null && !customIconPath`

**重试函数**（加在 handleFaviconRetry 附近）：
```ts
const handleFaviconRetry = () => {
  const url = addSiteUrl;
  setAddSiteUrl('');
  setFaviconError(null);
  setTimeout(() => setAddSiteUrl(url), 0);
};
```

**图标区域改动**：失败时在现有图标 div 上叠加：
- `cursor-pointer` + `onClick={handleFaviconRetry}`
- 半透明黑色遮罩（`bg-black/40`）
- 居中「↺ 重试」文字（白色，12px）

成功/加载中/有自定义图标时行为不变。

---

### Issue 5：禁用按钮视觉加强

**文件**：`src/renderer/panel-chrome/App.tsx`（约第 909 行）

```
// 改前
disabled:opacity-30

// 改后
disabled:opacity-50 disabled:saturate-0
```

- `opacity-50`：更可见，仍明显区别于激活态
- `saturate-0`：去饱和度变灰，视觉上「死掉」感更强
- `cursor-not-allowed` 和 `disabled:hover:bg-transparent` 保留不变

---

## 文件变更清单

| 文件 | 变更 |
|------|------|
| `src/renderer/panel-chrome/App.tsx` | 3 处独立修改：超时逻辑、favicon 重试函数 + 图标区域 overlay、按钮 disabled 样式 |

---

## 不在范围内

- 进度条标签（用户决定跳过）
- site-info 重试按钮
- favicon 超时（fetchFavicon 在 add-site 流程中，失败已有错误文字 + 本次加重试）
- 其他异步操作（config 加载、更新检查）
