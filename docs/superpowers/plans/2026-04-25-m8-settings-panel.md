# M8 Settings Panel + Theming Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement `builtin:settings` panel (PRD §5.12) with full 5-section UI plus a theming system supporting system / light / dark / custom (incl. transparent) modes.

**Architecture:** Settings UI lives inside existing panel-chrome React tree under a new `builtin:settings` widget branch. Theming is driven by a `ThemeService` in main, broadcasting `theme:updated` events that renderer applies as CSS variables on dock + panel-chrome roots. Transparent custom colors trigger window recreation (DockWindow + PanelWindow rebuilt with `transparent: true`). Config schema gets a new `appearance` section.

**Tech Stack:** Existing — Electron 28, React 18, TypeScript, Tailwind, IPC contract pattern. New: `nativeTheme` listener, `<input type="color">` + alpha slider for custom color.

**Reference spec:** `docs/superpowers/specs/2026-04-25-m8-design.md` (read before starting).

---

### Task 1: Config schema extension

**Files:**
- Modify: `src/shared/types.ts`
- Modify: `src/shared/constants.ts`
- Modify: `src/main/store/ConfigStore.ts`
- Test: `src/shared/__tests__/configDefaults.test.ts` (create)

- [ ] **Step 1: Add appearance type + ThemeMode**

In `src/shared/types.ts`:

```ts
export type ThemeMode = 'system' | 'light' | 'dark' | 'custom';

export interface AppearanceConfig {
  themeMode: ThemeMode;
  /** '#RRGGBBAA'，仅 themeMode='custom' 时生效 */
  customColor: string;
}

// Inside AppConfig, add:
export interface AppConfig {
  // ... existing fields ...
  appearance: AppearanceConfig;
}
```

- [ ] **Step 2: Add default appearance to DEFAULT_CONFIG**

In `src/shared/constants.ts`, inside `DEFAULT_CONFIG()`:

```ts
appearance: {
  themeMode: 'system',
  customColor: '#1B1B1BFF'
}
```

- [ ] **Step 3: Extend ConfigStore.update merge**

In `src/main/store/ConfigStore.ts` `update()` method, add appearance merge after layout:

```ts
appearance: {
  ...current.appearance,
  ...patch.appearance
},
```

- [ ] **Step 4: Write defaults test**

Create `src/shared/__tests__/configDefaults.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_CONFIG } from '../constants.ts';

describe('DEFAULT_CONFIG', () => {
  it('includes appearance with system theme and dark default custom color', () => {
    const config = DEFAULT_CONFIG();
    assert.equal(config.appearance.themeMode, 'system');
    assert.equal(config.appearance.customColor, '#1B1B1BFF');
  });
});
```

- [ ] **Step 5: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS, all existing tests still green, new test passes.

- [ ] **Step 6: Commit**

```bash
git add src/shared/types.ts src/shared/constants.ts src/main/store/ConfigStore.ts src/shared/__tests__/configDefaults.test.ts
git commit -m "feat(m8): extend AppConfig with appearance section"
```

---

### Task 2: Theme presets + color utilities

**Files:**
- Create: `src/shared/theme.ts`
- Test: `src/shared/__tests__/theme.test.ts`

- [ ] **Step 1: Write failing tests**

Create `src/shared/__tests__/theme.test.ts`:

```ts
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  THEME_PRESETS,
  getReadableForeground,
  parseHex8,
  resolveSurfaceColors,
  needsTransparency
} from '../theme.ts';

describe('parseHex8', () => {
  it('parses #RRGGBBAA', () => {
    assert.deepEqual(parseHex8('#1B1B1BFF'), { r: 27, g: 27, b: 27, a: 255 });
  });
  it('parses #RRGGBB as alpha 255', () => {
    assert.deepEqual(parseHex8('#FFFFFF'), { r: 255, g: 255, b: 255, a: 255 });
  });
});

describe('getReadableForeground', () => {
  it('returns dark fg for light bg', () => {
    assert.equal(getReadableForeground('#FFFFFFFF'), '#1B1B1BE6');
  });
  it('returns light fg for dark bg', () => {
    assert.equal(getReadableForeground('#1B1B1BFF'), '#FFFFFFE6');
  });
  it('treats transparent bg as dark (returns light fg)', () => {
    assert.equal(getReadableForeground('#00000000'), '#FFFFFFE6');
  });
});

describe('resolveSurfaceColors', () => {
  it('returns dark preset for dark mode', () => {
    const colors = resolveSurfaceColors({ themeMode: 'dark', customColor: '#000000FF' }, false);
    assert.equal(colors.bg, THEME_PRESETS.dark.bg);
    assert.equal(colors.fg, THEME_PRESETS.dark.fg);
  });
  it('returns light preset for light mode', () => {
    const colors = resolveSurfaceColors({ themeMode: 'light', customColor: '#000000FF' }, true);
    assert.equal(colors.bg, THEME_PRESETS.light.bg);
  });
  it('follows nativeIsDark for system mode', () => {
    const dark = resolveSurfaceColors({ themeMode: 'system', customColor: '#000000FF' }, true);
    const light = resolveSurfaceColors({ themeMode: 'system', customColor: '#000000FF' }, false);
    assert.equal(dark.bg, THEME_PRESETS.dark.bg);
    assert.equal(light.bg, THEME_PRESETS.light.bg);
  });
  it('uses customColor for custom mode', () => {
    const colors = resolveSurfaceColors({ themeMode: 'custom', customColor: '#80FF00CC' }, false);
    assert.equal(colors.bg, '#80FF00CC');
    assert.equal(colors.fg, '#1B1B1BE6'); // bright green → dark fg
  });
});

describe('needsTransparency', () => {
  it('returns false for non-custom modes', () => {
    assert.equal(needsTransparency({ themeMode: 'dark', customColor: '#00000000' }), false);
    assert.equal(needsTransparency({ themeMode: 'system', customColor: '#00000000' }), false);
  });
  it('returns false for fully opaque custom color', () => {
    assert.equal(needsTransparency({ themeMode: 'custom', customColor: '#1B1B1BFF' }), false);
  });
  it('returns true for transparent custom color', () => {
    assert.equal(needsTransparency({ themeMode: 'custom', customColor: '#1B1B1B80' }), true);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npm test 2>&1 | grep -i theme`
Expected: FAIL with module not found.

- [ ] **Step 3: Implement theme module**

Create `src/shared/theme.ts`:

```ts
import type { AppearanceConfig } from './types';

export interface SurfaceColors {
  bg: string;  // '#RRGGBBAA'
  fg: string;  // '#RRGGBBAA'
}

export const THEME_PRESETS: Record<'dark' | 'light', SurfaceColors> = {
  dark: { bg: '#1B1B1BFF', fg: '#FFFFFFE6' },
  light: { bg: '#F5F5F5FF', fg: '#1B1B1BE6' }
};

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

export const parseHex8 = (hex: string): RGBA => {
  const stripped = hex.replace(/^#/, '');
  const padded = stripped.length === 6 ? `${stripped}FF` : stripped;
  return {
    r: parseInt(padded.slice(0, 2), 16),
    g: parseInt(padded.slice(2, 4), 16),
    b: parseInt(padded.slice(4, 6), 16),
    a: parseInt(padded.slice(6, 8), 16)
  };
};

export const getReadableForeground = (hex8: string): string => {
  const { r, g, b, a } = parseHex8(hex8);
  // 透明背景按暗背景处理（白字优先），用户在暗桌面可读
  if (a < 128) {
    return '#FFFFFFE6';
  }
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 128 ? '#1B1B1BE6' : '#FFFFFFE6';
};

export const resolveSurfaceColors = (
  appearance: AppearanceConfig,
  nativeIsDark: boolean
): SurfaceColors => {
  if (appearance.themeMode === 'custom') {
    return {
      bg: appearance.customColor,
      fg: getReadableForeground(appearance.customColor)
    };
  }
  if (appearance.themeMode === 'system') {
    return nativeIsDark ? THEME_PRESETS.dark : THEME_PRESETS.light;
  }
  return THEME_PRESETS[appearance.themeMode];
};

export const needsTransparency = (appearance: AppearanceConfig): boolean => {
  if (appearance.themeMode !== 'custom') {
    return false;
  }
  const { a } = parseHex8(appearance.customColor);
  return a < 255;
};
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npm test`
Expected: PASS, all theme tests green.

- [ ] **Step 5: Commit**

```bash
git add src/shared/theme.ts src/shared/__tests__/theme.test.ts
git commit -m "feat(m8): add theme presets + color utilities"
```

---

### Task 3: builtin:settings route + QuickMenu wiring

**Files:**
- Modify: `src/shared/builtinPanels.ts`
- Modify: `src/shared/constants.ts`
- Modify: `src/main/panels/PanelManager.ts`
- Modify: `src/main/ipc/appHandlers.ts`
- Modify: `src/renderer/panel-chrome/App.tsx`
- Test: `src/shared/__tests__/builtinPanels.test.ts`

- [ ] **Step 1: Add 'settings' to BuiltinWidgetId**

In `src/shared/builtinPanels.ts`:

```ts
export type BuiltinWidgetId = 'add-site' | 'edit-site' | 'site-info' | 'settings';
```

Update regex in `parseBuiltinPanelId`:

```ts
const match = panelId.match(/^builtin:(add-site|edit-site|site-info|settings)(?::(.+))?$/);
```

- [ ] **Step 2: Confirm BUILTIN_SETTINGS_ID constant**

In `src/shared/constants.ts`, ensure exists (per existing grep result it does):

```ts
export const BUILTIN_SETTINGS_ID = 'builtin:settings';
```

If not present, add it.

- [ ] **Step 3: Extend builtinPanels test**

In `src/shared/__tests__/builtinPanels.test.ts`, add:

```ts
test('builds and parses settings builtin panel id', () => {
  const id = buildBuiltinPanelId('settings');
  assert.equal(id, 'builtin:settings');
  const route = parseBuiltinPanelId(id);
  assert.deepEqual(route, { widgetId: 'settings' });
});
```

- [ ] **Step 4: Add PanelManager branch for settings widget**

In `src/main/panels/PanelManager.ts`, after the existing `add-site` branch in `getDescriptor` (or wherever builtin descriptors are built), add:

```ts
if (builtinRoute?.widgetId === 'settings') {
  return {
    id: BUILTIN_SETTINGS_ID,
    title: '设置',
    url: 'about:blank',
    iconRef: { kind: 'letter', fallbackLetter: '⚙', fallbackColor: '#3F3F46' },
    order: -1,
    builtin: {
      widgetId: 'settings'
    }
  };
}
```

(Read the existing add-site branch first to match the exact descriptor shape.)

- [ ] **Step 5: Wire QuickMenu "设置" to open the panel**

In `src/main/ipc/appHandlers.ts`, replace the `dialog.showMessageBox` placeholder for the 设置 menu item with:

```ts
{
  label: '设置',
  click: async () => {
    try {
      await windowManager.showPanel('builtin:settings', true);
    } catch (error) {
      logger.error('quick-menu open settings failed', error);
    }
  }
},
```

- [ ] **Step 6: Add panel-chrome render branch**

In `src/renderer/panel-chrome/App.tsx`, find the existing `switch (descriptor.builtin?.widgetId)` block and add a `'settings'` case rendering a placeholder for now:

```tsx
case 'settings':
  return <div className="p-4 text-white">Settings (coming in next task)</div>;
```

- [ ] **Step 7: Verify panel opens**

Run: `npm run dev`
Expected: Click dock ⋮ → 设置 → panel opens with placeholder text. No errors.

- [ ] **Step 8: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/shared/builtinPanels.ts src/shared/constants.ts src/shared/__tests__/builtinPanels.test.ts src/main/panels/PanelManager.ts src/main/ipc/appHandlers.ts src/renderer/panel-chrome/App.tsx
git commit -m "feat(m8): add builtin:settings route + open from QuickMenu"
```

---

### Task 4: SettingsView shell + section nav

**Files:**
- Create: `src/renderer/panel-chrome/views/settings/SettingsView.tsx`
- Create: `src/renderer/panel-chrome/views/settings/sections/General.tsx`
- Create: `src/renderer/panel-chrome/views/settings/sections/Appearance.tsx`
- Create: `src/renderer/panel-chrome/views/settings/sections/Behavior.tsx`
- Create: `src/renderer/panel-chrome/views/settings/sections/Data.tsx`
- Create: `src/renderer/panel-chrome/views/settings/sections/About.tsx`
- Modify: `src/renderer/panel-chrome/App.tsx`

- [ ] **Step 1: Create SettingsView**

Create `src/renderer/panel-chrome/views/settings/SettingsView.tsx`:

```tsx
import { useEffect, useState } from 'react';
import type { AppConfig } from '@shared/types';
import { General } from './sections/General';
import { Appearance } from './sections/Appearance';
import { Behavior } from './sections/Behavior';
import { Data } from './sections/Data';
import { About } from './sections/About';

type SectionKey = 'general' | 'appearance' | 'behavior' | 'data' | 'about';

const NAV_ITEMS: { key: SectionKey; label: string }[] = [
  { key: 'general', label: '常规' },
  { key: 'appearance', label: '外观' },
  { key: 'behavior', label: '行为' },
  { key: 'data', label: '数据' },
  { key: 'about', label: '关于' }
];

export function SettingsView(): JSX.Element {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [section, setSection] = useState<SectionKey>('general');

  useEffect(() => {
    let mounted = true;
    void window.panelAPI.readConfig().then((result) => {
      if (mounted && result.ok) {
        setConfig(result.data);
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  const updateConfig = async (patch: Partial<AppConfig>): Promise<void> => {
    if (!config) return;
    const result = await window.panelAPI.updateConfig(patch);
    if (result.ok) {
      setConfig(result.data);
    }
  };

  if (!config) {
    return <div className="flex h-full items-center justify-center text-white/60">加载中...</div>;
  }

  return (
    <div className="flex h-full">
      <nav className="w-[188px] flex-shrink-0 border-r border-white/8 p-2">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setSection(item.key)}
            className={`mb-1 flex w-full items-center rounded-md px-3 py-2 text-left text-sm transition-colors ${
              section === item.key
                ? 'bg-white/10 text-white'
                : 'text-white/70 hover:bg-white/5'
            }`}
          >
            {item.label}
          </button>
        ))}
      </nav>
      <div className="flex-1 overflow-auto p-6 text-white">
        {section === 'general' && <General config={config} updateConfig={updateConfig} />}
        {section === 'appearance' && <Appearance config={config} updateConfig={updateConfig} />}
        {section === 'behavior' && <Behavior config={config} updateConfig={updateConfig} />}
        {section === 'data' && <Data />}
        {section === 'about' && <About />}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create stub section files**

Each of `General.tsx`, `Appearance.tsx`, `Behavior.tsx` follows shape:

```tsx
import type { AppConfig } from '@shared/types';

interface Props {
  config: AppConfig;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
}

export function General({ config: _config, updateConfig: _updateConfig }: Props): JSX.Element {
  return <div>General (stub)</div>;
}
```

`Data.tsx` and `About.tsx` take no props:

```tsx
export function Data(): JSX.Element {
  return <div>Data (stub)</div>;
}
```

- [ ] **Step 3: Wire SettingsView into panel-chrome**

In `src/renderer/panel-chrome/App.tsx`, replace the `'settings'` placeholder branch:

```tsx
case 'settings':
  return <SettingsView />;
```

Add import: `import { SettingsView } from './views/settings/SettingsView';`

- [ ] **Step 4: Verify panelAPI.updateConfig exists**

Read `src/preload/panel.ts`. If `updateConfig` is not exposed on `panelAPI`, add it:

```ts
updateConfig: (patch) => ipcRenderer.invoke(IPC_CHANNELS.configUpdate, patch),
```

And add to `PanelAPI` interface in `src/shared/ipc-contracts.ts`:

```ts
updateConfig: (patch: Partial<AppConfig>) => Promise<IpcResult<AppConfig>>;
```

- [ ] **Step 5: Run dev + verify nav**

Run: `npm run dev`
Click 设置. Expected: 5-tab left nav, click each shows stub. No errors.

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/panel-chrome/views src/renderer/panel-chrome/App.tsx src/preload/panel.ts src/shared/ipc-contracts.ts
git commit -m "feat(m8): SettingsView shell with section nav"
```

---

### Task 5: General + Behavior sections (toggles + sliders)

**Files:**
- Create: `src/renderer/panel-chrome/views/settings/components/Toggle.tsx`
- Create: `src/renderer/panel-chrome/views/settings/components/Slider.tsx`
- Modify: `src/renderer/panel-chrome/views/settings/sections/General.tsx`
- Modify: `src/renderer/panel-chrome/views/settings/sections/Behavior.tsx`

- [ ] **Step 1: Create Toggle component**

`Toggle.tsx`:

```tsx
interface ToggleProps {
  label: string;
  checked: boolean;
  onChange: (next: boolean) => void;
}

export function Toggle({ label, checked, onChange }: ToggleProps): JSX.Element {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 py-2">
      <span className="text-sm">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-6 w-11 rounded-full transition-colors ${
          checked ? 'bg-accent' : 'bg-white/15'
        }`}
      >
        <span
          className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-5' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}
```

- [ ] **Step 2: Create Slider component**

`Slider.tsx`:

```tsx
interface SliderProps {
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  unit?: string;
  onChange: (next: number) => void;
}

export function Slider({ label, min, max, step = 1, value, unit, onChange }: SliderProps): JSX.Element {
  return (
    <div className="py-2">
      <div className="mb-1 flex items-center justify-between text-sm">
        <span>{label}</span>
        <span className="text-white/70">{value}{unit}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-accent"
      />
    </div>
  );
}
```

- [ ] **Step 3: Implement General section**

```tsx
import type { AppConfig } from '@shared/types';
import { Toggle } from '../components/Toggle';

interface Props {
  config: AppConfig;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
}

export function General({ config, updateConfig }: Props): JSX.Element {
  return (
    <div className="space-y-1">
      <h2 className="mb-3 text-base font-medium">常规</h2>
      <Toggle
        label="开机自启"
        checked={config.app.autoLaunch}
        onChange={(next) => void updateConfig({ app: { ...config.app, autoLaunch: next } })}
      />
      <Toggle
        label="启动时显示侧边栏"
        checked={config.app.autoShowDock}
        onChange={(next) => void updateConfig({ app: { ...config.app, autoShowDock: next } })}
      />
      <Toggle
        label="全屏自动隐藏"
        checked={config.app.hideOnFullscreen}
        onChange={(next) => void updateConfig({ app: { ...config.app, hideOnFullscreen: next } })}
      />
    </div>
  );
}
```

- [ ] **Step 4: Implement Behavior section**

```tsx
import type { AppConfig } from '@shared/types';
import { Slider } from '../components/Slider';
import { Toggle } from '../components/Toggle';

interface Props {
  config: AppConfig;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
}

export function Behavior({ config, updateConfig }: Props): JSX.Element {
  return (
    <div className="space-y-1">
      <h2 className="mb-3 text-base font-medium">行为</h2>
      <Slider
        label="悬停触发延迟"
        min={100}
        max={500}
        step={10}
        unit="ms"
        value={config.behavior.hoverOpenDelayMs}
        onChange={(v) =>
          void updateConfig({ behavior: { ...config.behavior, hoverOpenDelayMs: v } })
        }
      />
      <Slider
        label="离开关闭延迟"
        min={100}
        max={800}
        step={10}
        unit="ms"
        value={config.behavior.hoverCloseDelayMs}
        onChange={(v) =>
          void updateConfig({ behavior: { ...config.behavior, hoverCloseDelayMs: v } })
        }
      />
      <Toggle
        label="隐藏时继续播放音频"
        checked={config.behavior.keepAudioOnHide}
        onChange={(next) =>
          void updateConfig({ behavior: { ...config.behavior, keepAudioOnHide: next } })
        }
      />
    </div>
  );
}
```

- [ ] **Step 5: Verify**

Run: `npm run dev`
Expected: 常规 toggle 切 autoLaunch 立刻持久化（之前 QuickMenu 路径已验证）；行为分区滑块拖动数值更新。Behavior 三项暂未联动副作用，下面 Task 11 处理。

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/panel-chrome/views/settings
git commit -m "feat(m8): General + Behavior sections with Toggle/Slider"
```

---

### Task 6: Appearance section (edge + width + theme + custom color)

**Files:**
- Create: `src/renderer/panel-chrome/views/settings/components/Radio.tsx`
- Create: `src/renderer/panel-chrome/views/settings/components/ColorAlphaPicker.tsx`
- Modify: `src/renderer/panel-chrome/views/settings/sections/Appearance.tsx`

- [ ] **Step 1: Create Radio component**

```tsx
interface RadioOption<T extends string> {
  value: T;
  label: string;
}

interface RadioProps<T extends string> {
  label: string;
  options: RadioOption<T>[];
  value: T;
  onChange: (next: T) => void;
}

export function Radio<T extends string>({ label, options, value, onChange }: RadioProps<T>): JSX.Element {
  return (
    <div className="py-2">
      <div className="mb-2 text-sm">{label}</div>
      <div className="flex gap-2">
        {options.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value)}
            className={`rounded-md border px-3 py-1 text-sm transition-colors ${
              value === opt.value
                ? 'border-accent bg-accent/10 text-white'
                : 'border-white/15 text-white/70 hover:border-white/30'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create ColorAlphaPicker component**

```tsx
import { parseHex8 } from '@shared/theme';

interface Props {
  label: string;
  value: string; // '#RRGGBBAA'
  onChange: (next: string) => void;
}

const toHex2 = (n: number): string => n.toString(16).padStart(2, '0').toUpperCase();

export function ColorAlphaPicker({ label, value, onChange }: Props): JSX.Element {
  const { r, g, b, a } = parseHex8(value);
  const rgbHex = `#${toHex2(r)}${toHex2(g)}${toHex2(b)}`;
  const alphaPercent = Math.round((a / 255) * 100);

  const updateRgb = (rgb: string): void => {
    const stripped = rgb.replace(/^#/, '').toUpperCase();
    onChange(`#${stripped}${toHex2(a)}`);
  };

  const updateAlpha = (percent: number): void => {
    const alpha = Math.round((percent / 100) * 255);
    onChange(`${rgbHex}${toHex2(alpha)}`);
  };

  return (
    <div className="py-2">
      <div className="mb-2 text-sm">{label}</div>
      <div className="flex items-center gap-3">
        <input
          type="color"
          value={rgbHex}
          onChange={(e) => updateRgb(e.target.value)}
          className="h-9 w-14 cursor-pointer rounded border border-white/15 bg-transparent"
        />
        <div className="flex-1">
          <div className="mb-1 flex items-center justify-between text-xs text-white/70">
            <span>不透明度</span>
            <span>{alphaPercent}%</span>
          </div>
          <input
            type="range"
            min={0}
            max={100}
            value={alphaPercent}
            onChange={(e) => updateAlpha(Number(e.target.value))}
            className="w-full accent-accent"
          />
        </div>
      </div>
      <div className="mt-2 text-xs text-white/50">{value}</div>
    </div>
  );
}
```

- [ ] **Step 3: Implement Appearance section**

```tsx
import type { AppConfig, ThemeMode } from '@shared/types';
import { Radio } from '../components/Radio';
import { Slider } from '../components/Slider';
import { ColorAlphaPicker } from '../components/ColorAlphaPicker';

interface Props {
  config: AppConfig;
  updateConfig: (patch: Partial<AppConfig>) => Promise<void>;
}

export function Appearance({ config, updateConfig }: Props): JSX.Element {
  return (
    <div className="space-y-1">
      <h2 className="mb-3 text-base font-medium">外观</h2>
      <Radio
        label="图标栏位置"
        options={[
          { value: 'left', label: '左' },
          { value: 'right', label: '右' }
        ]}
        value={config.layout.edge}
        onChange={(v) => void updateConfig({ layout: { ...config.layout, edge: v } })}
      />
      <Slider
        label="面板默认宽度"
        min={320}
        max={800}
        step={10}
        unit="px"
        value={config.layout.panelDefaultWidth}
        onChange={(v) =>
          void updateConfig({ layout: { ...config.layout, panelDefaultWidth: v } })
        }
      />
      <Radio<ThemeMode>
        label="主题"
        options={[
          { value: 'system', label: '跟随系统' },
          { value: 'light', label: '浅色' },
          { value: 'dark', label: '深色' },
          { value: 'custom', label: '自定义' }
        ]}
        value={config.appearance.themeMode}
        onChange={(v) =>
          void updateConfig({ appearance: { ...config.appearance, themeMode: v } })
        }
      />
      {config.appearance.themeMode === 'custom' && (
        <ColorAlphaPicker
          label="自定义颜色"
          value={config.appearance.customColor}
          onChange={(v) =>
            void updateConfig({ appearance: { ...config.appearance, customColor: v } })
          }
        />
      )}
    </div>
  );
}
```

- [ ] **Step 4: Verify UI**

Run: `npm run dev`
Expected: 外观分区显示 4 控件；切 edge 立即应用（已有副作用）；调宽度滑块持久化（实时联动 panel 宽度需要 Task 11）；切 themeMode 持久化（视觉不变，Task 9 接入）；custom 模式显示 color picker。

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/panel-chrome/views/settings
git commit -m "feat(m8): Appearance section with theme picker"
```

---

### Task 7: Data section + IPCs

**Files:**
- Modify: `src/shared/ipc-contracts.ts`
- Modify: `src/preload/panel.ts`
- Create: `src/main/ipc/settingsHandlers.ts`
- Modify: `src/main/ipc/index.ts`
- Modify: `src/renderer/panel-chrome/views/settings/sections/Data.tsx`
- Modify: `src/main/windows/WindowManager.ts`

- [ ] **Step 1: Add IPC channels**

In `src/shared/ipc-contracts.ts` `IPC_CHANNELS`:

```ts
settingsOpenConfigFolder: 'settings:open-config-folder',
settingsExportConfig: 'settings:export-config',
settingsImportConfig: 'settings:import-config',
settingsClearStorageData: 'settings:clear-storage-data',
settingsCheckUpdate: 'settings:check-update',
settingsQuitApp: 'settings:quit-app',
```

In `PanelAPI` interface:

```ts
openConfigFolder: () => Promise<IpcResult<void>>;
exportConfig: () => Promise<IpcResult<{ canceled: boolean; path?: string }>>;
importConfig: () => Promise<IpcResult<{ canceled: boolean; restartRequired: boolean }>>;
clearStorageData: () => Promise<IpcResult<void>>;
checkUpdate: () => Promise<IpcResult<{ status: 'placeholder' }>>;
quitApp: () => Promise<IpcResult<void>>;
```

- [ ] **Step 2: Update preload**

In `src/preload/panel.ts`, add to `panelAPI`:

```ts
openConfigFolder: () => ipcRenderer.invoke(IPC_CHANNELS.settingsOpenConfigFolder),
exportConfig: () => ipcRenderer.invoke(IPC_CHANNELS.settingsExportConfig),
importConfig: () => ipcRenderer.invoke(IPC_CHANNELS.settingsImportConfig),
clearStorageData: () => ipcRenderer.invoke(IPC_CHANNELS.settingsClearStorageData),
checkUpdate: () => ipcRenderer.invoke(IPC_CHANNELS.settingsCheckUpdate),
quitApp: () => ipcRenderer.invoke(IPC_CHANNELS.settingsQuitApp),
```

- [ ] **Step 3: Add WindowManager.reloadAfterImport**

In `src/main/windows/WindowManager.ts`:

```ts
/** 配置导入后销毁全部窗口并按新 config 重建（不退出 app）。 */
async reloadAfterImport(nextConfig: AppConfig): Promise<void> {
  // 销毁现有窗口
  this.dockWindow?.getBrowserWindow()?.destroy();
  this.panelWindow?.getBrowserWindow()?.destroy();
  this.panelAnimationWindow?.getBrowserWindow()?.destroy();
  this.panelMenuWindow?.getBrowserWindow()?.destroy();
  this.dockWindow = null;
  this.panelWindow = null;
  this.panelAnimationWindow = null;
  this.panelMenuWindow = null;
  this.panelManager = null;
  // 用新 config 重建（注意 this.config 是 readonly 引用，需要新 WindowManager 实例 或 暴露 setter）
  // 简化：在 createWindows 之前更新 this.config 的引用 — 改为可变字段
  (this as { config: AppConfig }).config = nextConfig;
  this.createWindows();
}
```

Note: `private readonly config` declared in constructor is immutable. Change to `private config: AppConfig` and assign in constructor body, so `reloadAfterImport` can update.

- [ ] **Step 4: Implement settingsHandlers**

Create `src/main/ipc/settingsHandlers.ts`:

```ts
import { app, BrowserWindow, dialog, ipcMain, session, shell } from 'electron';
import { copyFile, readFile } from 'node:fs/promises';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { AppConfig, IpcResult } from '../../shared/types';
import { logger } from '../utils/logger';
import { getConfigPath } from '../utils/paths';
import type { ConfigStore } from '../store/ConfigStore';
import type { WindowManager } from '../windows/WindowManager';

const isValidConfigShape = (raw: unknown): raw is AppConfig => {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  return (
    typeof obj.app === 'object' &&
    typeof obj.layout === 'object' &&
    typeof obj.behavior === 'object' &&
    Array.isArray(obj.panels) &&
    typeof obj.appearance === 'object'
  );
};

export const registerSettingsHandlers = (
  configStore: ConfigStore,
  windowManager: WindowManager
): void => {
  ipcMain.handle(IPC_CHANNELS.settingsOpenConfigFolder, async (): Promise<IpcResult<void>> => {
    try {
      await shell.openPath(app.getPath('userData'));
      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('settings:open-config-folder failed', error);
      return { ok: false, error: error instanceof Error ? error.message : 'unknown' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.settingsExportConfig, async (): Promise<
    IpcResult<{ canceled: boolean; path?: string }>
  > => {
    try {
      const result = await dialog.showSaveDialog({
        title: '导出配置',
        defaultPath: 'sidebar-plus-config.json',
        filters: [{ name: 'JSON', extensions: ['json'] }]
      });
      if (result.canceled || !result.filePath) {
        return { ok: true, data: { canceled: true } };
      }
      await copyFile(getConfigPath(), result.filePath);
      return { ok: true, data: { canceled: false, path: result.filePath } };
    } catch (error) {
      logger.error('settings:export-config failed', error);
      return { ok: false, error: error instanceof Error ? error.message : 'unknown' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.settingsImportConfig, async (): Promise<
    IpcResult<{ canceled: boolean; restartRequired: boolean }>
  > => {
    try {
      const result = await dialog.showOpenDialog({
        title: '导入配置',
        filters: [{ name: 'JSON', extensions: ['json'] }],
        properties: ['openFile']
      });
      if (result.canceled || result.filePaths.length === 0) {
        return { ok: true, data: { canceled: true, restartRequired: false } };
      }
      const raw = await readFile(result.filePaths[0], 'utf8');
      const parsed = JSON.parse(raw) as unknown;
      if (!isValidConfigShape(parsed)) {
        return { ok: false, error: '配置文件格式无效' };
      }
      const next = await configStore.update(parsed as Partial<AppConfig>);
      await windowManager.reloadAfterImport(next);
      return { ok: true, data: { canceled: false, restartRequired: false } };
    } catch (error) {
      logger.error('settings:import-config failed', error);
      return { ok: false, error: error instanceof Error ? error.message : 'unknown' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.settingsClearStorageData, async (): Promise<IpcResult<void>> => {
    try {
      // 清所有 BrowserWindow 与 WebContentsView 的默认 session
      // 简化：清主 session（partition 'persist:default'）+ 默认 session
      await session.defaultSession.clearStorageData();
      for (const win of BrowserWindow.getAllWindows()) {
        const ses = win.webContents.session;
        if (ses !== session.defaultSession) {
          await ses.clearStorageData();
        }
      }
      return { ok: true, data: undefined };
    } catch (error) {
      logger.error('settings:clear-storage-data failed', error);
      return { ok: false, error: error instanceof Error ? error.message : 'unknown' };
    }
  });

  ipcMain.handle(IPC_CHANNELS.settingsCheckUpdate, async (): Promise<
    IpcResult<{ status: 'placeholder' }>
  > => {
    return { ok: true, data: { status: 'placeholder' } };
  });

  ipcMain.handle(IPC_CHANNELS.settingsQuitApp, async (): Promise<IpcResult<void>> => {
    app.quit();
    return { ok: true, data: undefined };
  });
};
```

- [ ] **Step 5: Register settings handlers**

In `src/main/ipc/index.ts`:

```ts
import { registerSettingsHandlers } from './settingsHandlers';

// inside registerIpcHandlers:
registerSettingsHandlers(configStore, windowManager);
```

- [ ] **Step 6: Implement Data section UI**

```tsx
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
          if (result.ok && !result.data.canceled) {
            // 窗口已被 reloadAfterImport 重建；当前 panel 已销毁，无需 UI 反馈
          } else if (!result.ok) {
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
```

- [ ] **Step 7: Verify each button**

Run: `npm run dev`
Test:
- 打开配置文件夹 → 资源管理器打开 userData 目录
- 导出配置 → 保存对话框 → 选择路径 → 文件存在
- 导入配置 → 选择刚导出的文件 → 窗口重建（dock + panel 闪一下）→ 配置生效
- 清除：点击 → 二次确认 → 确认 → alert "已清除"

- [ ] **Step 8: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add src/shared/ipc-contracts.ts src/preload/panel.ts src/main/ipc/settingsHandlers.ts src/main/ipc/index.ts src/main/windows/WindowManager.ts src/renderer/panel-chrome/views/settings/sections/Data.tsx
git commit -m "feat(m8): Data section + import/export/clear IPCs"
```

---

### Task 8: About section

**Files:**
- Modify: `src/renderer/panel-chrome/views/settings/sections/About.tsx`

- [ ] **Step 1: Implement About**

```tsx
import { APP_NAME, APP_VERSION } from '@shared/constants';

const GITHUB_URL = 'https://github.com/Asulerrr/SiderbarPlus';

export function About(): JSX.Element {
  return (
    <div className="space-y-3">
      <h2 className="mb-3 text-base font-medium">关于</h2>
      <div>
        <div className="text-base font-medium">{APP_NAME}</div>
        <div className="text-sm text-white/60">版本 {APP_VERSION}</div>
      </div>
      <button
        type="button"
        onClick={async () => {
          const result = await window.panelAPI.checkUpdate();
          if (result.ok && result.data.status === 'placeholder') {
            window.alert('检查更新功能将在 M9 阶段实现。');
          }
        }}
        className="block w-full rounded-md border border-white/15 px-3 py-2 text-left text-sm hover:bg-white/5"
      >
        检查更新
      </button>
      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => {
          e.preventDefault();
          // Electron 渲染端 a target=_blank 不会真打开外部，走 panelAPI
          void window.panelAPI.openExternal({ panelId: 'builtin:settings', url: GITHUB_URL });
        }}
        className="block w-full rounded-md border border-white/15 px-3 py-2 text-left text-sm hover:bg-white/5"
      >
        GitHub 仓库
      </a>
      <button
        type="button"
        onClick={() => void window.panelAPI.quitApp()}
        className="block w-full rounded-md border border-white/15 px-3 py-2 text-left text-sm hover:bg-white/5"
      >
        退出程序
      </button>
    </div>
  );
}
```

Note: `window.panelAPI.openExternal` already exists per ipc-contracts (`openExternal: (payload: PanelOpenExternalPayload) => Promise<IpcResult<void>>`).

- [ ] **Step 2: Verify**

Run: `npm run dev`
Test:
- 检查更新 → alert 「M9 实现」
- GitHub 仓库 → 浏览器打开仓库
- 退出程序 → app 退出

- [ ] **Step 3: Commit**

```bash
git add src/renderer/panel-chrome/views/settings/sections/About.tsx
git commit -m "feat(m8): About section with quit + check-update placeholder"
```

---

### Task 9: ThemeService + CSS variable injection

**Files:**
- Create: `src/main/services/ThemeService.ts`
- Modify: `src/main/index.ts`
- Modify: `src/main/ipc/configHandlers.ts`
- Modify: `src/shared/ipc-contracts.ts`
- Modify: `src/preload/dock.ts`
- Modify: `src/preload/panel.ts`
- Modify: `src/renderer/dock/App.tsx`
- Modify: `src/renderer/panel-chrome/App.tsx`
- Modify: `tailwind.config.ts` (or `.js`)

- [ ] **Step 1: Add IPC channel for theme push**

In `IPC_CHANNELS`:

```ts
themeUpdated: 'theme:updated',
```

Update `DockAPI` and `PanelAPI`:

```ts
onThemeUpdated: (callback: (colors: { bg: string; fg: string }) => void) => () => void;
```

- [ ] **Step 2: Implement ThemeService**

Create `src/main/services/ThemeService.ts`:

```ts
import { BrowserWindow, nativeTheme } from 'electron';
import { IPC_CHANNELS } from '../../shared/ipc-contracts';
import type { AppearanceConfig } from '../../shared/types';
import { resolveSurfaceColors, type SurfaceColors } from '../../shared/theme';
import { logger } from '../utils/logger';

export class ThemeService {
  private appearance: AppearanceConfig;
  private current: SurfaceColors;
  private listener: (() => void) | null = null;

  constructor(initial: AppearanceConfig) {
    this.appearance = initial;
    this.current = resolveSurfaceColors(initial, nativeTheme.shouldUseDarkColors);
  }

  start(): void {
    this.listener = () => {
      if (this.appearance.themeMode === 'system') {
        this.recompute();
      }
    };
    nativeTheme.on('updated', this.listener);
  }

  stop(): void {
    if (this.listener) {
      nativeTheme.off('updated', this.listener);
      this.listener = null;
    }
  }

  setAppearance(next: AppearanceConfig): void {
    this.appearance = next;
    this.recompute();
  }

  getColors(): SurfaceColors {
    return this.current;
  }

  private recompute(): void {
    const next = resolveSurfaceColors(this.appearance, nativeTheme.shouldUseDarkColors);
    this.current = next;
    this.broadcast(next);
    logger.info('Theme updated', next);
  }

  private broadcast(colors: SurfaceColors): void {
    for (const win of BrowserWindow.getAllWindows()) {
      win.webContents.send(IPC_CHANNELS.themeUpdated, colors);
    }
  }
}
```

- [ ] **Step 3: Wire ThemeService in bootstrap**

In `src/main/index.ts`:

```ts
import { ThemeService } from './services/ThemeService';

// after configStore.initialize:
const themeService = new ThemeService(config.appearance);
themeService.start();

// pass themeService to registerIpcHandlers (extend signature)
```

- [ ] **Step 4: Wire ThemeService into configHandlers**

`registerConfigHandlers` accepts `themeService` param. After `configStore.update`, in the diff section:

```ts
if (
  before.appearance.themeMode !== config.appearance.themeMode ||
  before.appearance.customColor !== config.appearance.customColor
) {
  themeService.setAppearance(config.appearance);
}
```

- [ ] **Step 5: Update preloads**

In both `dock.ts` and `panel.ts`:

```ts
onThemeUpdated: (callback) => {
  const listener = (_e: Electron.IpcRendererEvent, colors: { bg: string; fg: string }) => callback(colors);
  ipcRenderer.on(IPC_CHANNELS.themeUpdated, listener);
  return () => ipcRenderer.removeListener(IPC_CHANNELS.themeUpdated, listener);
},
```

- [ ] **Step 6: Apply theme as CSS vars in dock**

In `src/renderer/dock/App.tsx`, add useEffect:

```tsx
useEffect(() => {
  // 初始化：从 config 读颜色（system 模式渲染端不知 nativeIsDark，先用 dark 兜底）
  const setVars = (colors: { bg: string; fg: string }): void => {
    document.documentElement.style.setProperty('--surface-bg', colors.bg);
    document.documentElement.style.setProperty('--surface-fg', colors.fg);
  };
  // 监听 main 推送
  const dispose = window.dockAPI.onThemeUpdated(setVars);
  return dispose;
}, []);
```

Same effect in `panel-chrome/App.tsx` using `window.panelAPI.onThemeUpdated`.

- [ ] **Step 7: Push initial theme on window load**

ThemeService also needs to push on every window's `did-finish-load`. Modify `start()`:

```ts
start(): void {
  this.listener = () => { ... };
  nativeTheme.on('updated', this.listener);
  // 新窗口加载完成后立即推送当前主题
  app.on('browser-window-created', (_e, window) => {
    window.webContents.once('did-finish-load', () => {
      window.webContents.send(IPC_CHANNELS.themeUpdated, this.current);
    });
  });
}
```

(Need to import `app` from electron.)

- [ ] **Step 8: Replace hardcoded colors with CSS var**

In `tailwind.config.ts`, change `colors.dock` from hardcoded to `'var(--surface-bg)'`. Same for any places using `bg-[#1b1b1b]`.

Search for hardcoded:
```bash
rg -n "bg-\\[#1[bB]1[bB]1[bB]\\]|bg-\\[#1B1B1B\\]" src/renderer
```

Replace with `bg-[var(--surface-bg)]`.

For text, find hardcoded `text-white` on surfaces that should follow theme; replace with `text-[var(--surface-fg)]` only on the panel-chrome inner card and dock root. (Leave button/accent text unchanged.)

- [ ] **Step 9: Verify**

Run: `npm run dev`
Test:
- system 模式：dock + panel 显示当前系统主题色（Windows 系统切深浅 dock 跟随）
- light 模式：浅灰背景，黑字
- dark 模式：深色背景，白字
- custom 模式 + 选橙色：dock + panel 橙色，黑字

- [ ] **Step 10: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 11: Commit**

```bash
git add src/main/services/ThemeService.ts src/main/index.ts src/main/ipc/configHandlers.ts src/main/ipc/index.ts src/shared/ipc-contracts.ts src/preload src/renderer tailwind.config.ts
git commit -m "feat(m8): theme system with CSS vars + nativeTheme listener"
```

---

### Task 10: Transparency window recreation

**Files:**
- Modify: `src/main/windows/DockWindow.ts`
- Modify: `src/main/windows/PanelWindow.ts`
- Modify: `src/main/windows/WindowManager.ts`
- Modify: `src/main/ipc/configHandlers.ts`

- [ ] **Step 1: DockWindow accepts transparency**

In `src/main/windows/DockWindow.ts` `create()`:

```ts
import { needsTransparency } from '../../shared/theme';

// inside create():
const transparent = needsTransparency(this.config.appearance);

this.window = new BrowserWindow({
  ...bounds,
  frame: false,
  transparent,
  hasShadow: false,
  // 当 transparent 时不设 backgroundColor（或设 #00000000）
  backgroundColor: transparent ? '#00000000' : DOCK_BACKGROUND,
  // ... rest unchanged ...
});
```

- [ ] **Step 2: PanelWindow already transparent**

PanelWindow has `transparent: true` already. No change needed.

- [ ] **Step 3: PanelAnimationWindow already transparent**

No change needed.

- [ ] **Step 4: Add WindowManager.recreateForTransparency**

```ts
/** 当透明状态变化时（custom 模式 alpha < 255 ⇄ 不透明），需销毁重建 dock + panel 窗口。 */
async recreateForTransparency(nextConfig: AppConfig): Promise<void> {
  await this.reloadAfterImport(nextConfig); // 复用导入路径的销毁+重建
}
```

- [ ] **Step 5: Detect transparency change in configHandlers**

```ts
import { needsTransparency } from '../../shared/theme';

// in configUpdate diff:
const wasTransparent = needsTransparency(before.appearance);
const isTransparent = needsTransparency(config.appearance);
if (wasTransparent !== isTransparent) {
  await windowManager.recreateForTransparency(config);
}
```

- [ ] **Step 6: Verify**

Run: `npm run dev`
Test:
- custom 模式 alpha=100% → dock 不透明
- 拖 alpha 滑块到 50% → 窗口重建（闪一下），dock 半透明
- 切回 dark/light/system → 窗口再重建，回到不透明

- [ ] **Step 7: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src/main/windows src/main/ipc/configHandlers.ts
git commit -m "feat(m8): recreate windows when transparency state changes"
```

---

### Task 11: Side-effect wiring (panelDefaultWidth + keepAudioOnHide + autoShowDock)

**Files:**
- Modify: `src/main/panels/PanelManager.ts`
- Modify: `src/main/ipc/configHandlers.ts`
- Modify: `src/main/index.ts`

- [ ] **Step 1: Add PanelManager.applyPanelDefaultWidthChange**

```ts
/** 设置面板修改 panelDefaultWidth 时立即对当前打开的 panel 生效。 */
applyPanelDefaultWidthChange(width: number): void {
  if (this.state !== 'open' || !this.currentPanelId) {
    return;
  }
  this.panelWindow.updateBounds(this.edge, width, this.displayId);
  this.animationWindow.updateBounds(this.edge, width, this.displayId);
  const view = this.webPanelHost.getView(this.currentPanelId);
  if (view) {
    this.updateViewBounds(view, this.edge, width);
  }
}
```

- [ ] **Step 2: Wire in configHandlers**

```ts
if (before.layout.panelDefaultWidth !== config.layout.panelDefaultWidth) {
  windowManager.applyPanelDefaultWidthChange(config.layout.panelDefaultWidth);
}
```

Add `WindowManager.applyPanelDefaultWidthChange(width)` that delegates to `panelManager.applyPanelDefaultWidthChange(width)`.

- [ ] **Step 3: Implement keepAudioOnHide in hidePanel**

In `src/main/panels/PanelManager.ts` `hidePanel` (or wherever the "minimize keeps view alive" path lives), find where view becomes hidden but not destroyed. Add:

```ts
// 读 latest config
const config = await this.configStore.read();
if (this.currentPanelId) {
  const view = this.webPanelHost.getView(this.currentPanelId);
  if (view) {
    view.webContents.setAudioMuted(!config.behavior.keepAudioOnHide);
  }
}
```

When the panel is shown again (in `switchPanel` or similar), unmute:

```ts
view.webContents.setAudioMuted(false);
```

- [ ] **Step 4: Implement autoShowDock at bootstrap**

In `src/main/index.ts` `bootstrap()`, after `windowManager.createWindows()`:

```ts
// PRD §5.12 常规："启动时显示侧边栏" 默认 true
// --autostart 场景下若 autoShowDock=false，dock 窗口已创建但保持隐藏，等用户从托盘激活
if (isAutoStart && !config.app.autoShowDock) {
  windowManager.hideDockToTray();
}
```

Note: `DockWindow.create` already calls `showInactive` on `ready-to-show`. For autoShowDock=false at startup, we need to suppress that. Two options:
- Pass `autoShow: boolean` param to DockWindow.create
- After createWindows, check flag and immediately hide

Simpler: post-create hide. Show callback fires on ready-to-show then immediately we call hide. Brief flicker; acceptable for cold autostart path.

- [ ] **Step 5: Verify**

Run: `npm run dev`
Test:
- 打开 panel → 设置 → 行为 → 关闭「隐藏时继续播放音频」→ 关闭 panel → 音频应当静音（如果当前是 youtube 播放视频则验证）
- 设置 → 外观 → 调整面板默认宽度滑块 → 当前打开的 panel 立即变宽
- 设置 → 常规 → 关闭「启动时显示侧边栏」→ 退出 app（从设置「退出程序」）→ 命令行 `electron . --autostart` → dock 不显示，托盘图标在；点托盘 → dock 显示

- [ ] **Step 6: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/main/panels/PanelManager.ts src/main/ipc/configHandlers.ts src/main/index.ts src/main/windows/WindowManager.ts
git commit -m "feat(m8): live panel-width + keepAudioOnHide + autoShowDock bootstrap"
```

---

### Task 12: README + final verification

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update milestone checklist**

In `README.md`, mark M8 done.

- [ ] **Step 2: Full smoke test**

Run all 5 sections end-to-end. Specifically:
- 常规 3 toggles
- 外观 4 controls (edge / width / theme mode / custom color when applicable)
- 行为 3 controls
- 数据 4 buttons
- 关于 3 buttons
- 主题切换：system/light/dark/custom，custom 透明 alpha 滑动重建窗口
- 配置导入导出对称（导出后导入，应等价）

- [ ] **Step 3: Run all checks**

Run: `npm run typecheck && npm run lint 2>&1 || true && npm test`
Expected: typecheck PASS, all tests PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: M8 settings panel + theming complete"
```
