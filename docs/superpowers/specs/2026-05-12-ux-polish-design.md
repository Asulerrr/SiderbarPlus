# UX Polish: 4 Improvements Design

Date: 2026-05-12

## Overview

Four independent UX improvements to the SideBar Electron app:

1. Panel loading progress bar
2. Copy link toast feedback
3. Resize handle visibility
4. Favicon retry max limit

---

## 1. Panel Loading Progress Bar

**Goal:** Show a top-edge progress bar while web content is loading, so users know the panel isn't frozen.

**Location:** `src/renderer/panel-chrome/App.tsx`

**Behavior:**
- When `navigationState.isLoading` becomes `true`: bar appears at 0%, transitions to 70% over 1.5s (fake progress via CSS transition)
- When `isLoading` becomes `false`: bar jumps to 100%, then fades out over 200ms and is removed from DOM
- Bar sits between the chrome header and the web content area (absolute positioned, z-index above content)
- Color: accent purple `#6c63ff` (fixed, no theme dependency)

**Implementation:**
- No new IPC channels needed — `NavigationState.isLoading` already exists and is emitted via `onNavigationState`
- React state: `loadingProgress: number` (0–100) + `loadingVisible: boolean`
- CSS: `transition: width 1.5s ease-out` for fake progress, `transition: opacity 0.2s` for fade-out
- Height: 2px, full width, no border-radius

**Edge cases:**
- If a new navigation starts while bar is fading out, reset immediately to 0% and show again
- Bar is hidden (not rendered) when `loadingVisible` is false to avoid layout impact

---

## 2. Copy Link Toast

**Goal:** Confirm to the user that the URL was copied to clipboard.

**Location:** `src/renderer/panel-chrome/App.tsx`

**Behavior:**
- Triggered when the copy-link button is clicked and `navigator.clipboard.writeText()` resolves
- Toast appears: green capsule pill (`✓ 链接已复制`), centered horizontally, 8px below the chrome header
- Visible for 2 seconds, then fades out over 200ms
- If copy fails (clipboard API error), toast does not appear (silent failure, same as current behavior)

**Implementation:**
- No new IPC channels needed — clipboard write happens entirely in renderer
- React state: `showCopyToast: boolean`
- `setTimeout` of 2000ms to clear state
- CSS: `position: absolute`, `top: header-height + 8px`, `left: 50%`, `transform: translateX(-50%)`, `z-index: 100`
- Style: `background: #4ade80`, `color: #000`, `font-size: 12px`, `font-weight: 600`, `padding: 4px 14px`, `border-radius: 20px`
- Fade: `opacity` transition 0.2s on unmount (use CSS class toggle, not unmount, to allow transition)

---

## 3. Resize Handle Visibility

**Goal:** Make the drag-to-resize zone discoverable by showing a glowing edge line on hover.

**Location:** `src/renderer/panel-chrome/components/ResizeHandle.tsx`

**Behavior:**
- When mouse enters the 8px drag zone: a 2px wide vertical line appears on the inner edge of the handle
- Line style: `linear-gradient(180deg, transparent 0%, #6c63ff 30%, #6c63ff 70%, transparent 100%)`, opacity 0.7
- Fade in: `opacity` transition 0.15s ease
- Fade out: same transition on mouse leave
- During active drag: line stays visible at full opacity

**Implementation:**
- Add `isHovered: boolean` state to `ResizeHandle`
- `onMouseEnter` → `setIsHovered(true)`, `onMouseLeave` → `setIsHovered(false)` (only when not dragging)
- Render a `<div>` inside the handle with the gradient line, controlled by `isHovered || isDragging`
- The line div: `position: absolute`, `width: 2px`, `height: 100%`, positioned on the panel-facing edge (left edge if panel is on right, right edge if panel is on left)
- Edge side determined by a prop passed from `App.tsx` (already has access to `config.layout.edge`)

---

## 4. Favicon Retry Max Limit

**Goal:** Stop retrying favicon fetch after 5 failures to prevent infinite network requests.

**Location:** `src/renderer/dock/components/DockItem.tsx`

**Behavior:**
- Current: retries indefinitely with exponential backoff (5s → 10s → 20s → 40s cap)
- New: stop retrying after `retryTick >= 5` (5 attempts total)
- After max retries: keep letter fallback displayed permanently for the session
- No user-visible change beyond the letter fallback staying (which already shows on failure)

**Implementation:**
- Add guard in the retry `useEffect`: `if (retryTick >= 5) return;`
- No UI changes needed — letter fallback already renders correctly when `iconFailed` is true

---

## Files Changed

| File | Change |
|------|--------|
| `src/renderer/panel-chrome/App.tsx` | Add progress bar state + render, add copy toast state + render |
| `src/renderer/panel-chrome/components/ResizeHandle.tsx` | Add hover state + glow line render, accept `edge` prop |
| `src/renderer/panel-chrome/panel.css` | Add progress bar and toast CSS classes |
| `src/renderer/dock/components/DockItem.tsx` | Add `retryTick >= 5` guard |

---

## Out of Scope

- Keyboard shortcuts
- Notification badges on dock icons
- Panel preview on hover
- Any changes to IPC contracts or main process
