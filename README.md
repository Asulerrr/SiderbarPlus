# Sidebar Plus

Electron-based Windows sidebar app scaffolded from the product PRD.

## Milestone Status

- `M1`: completed
- `M2`: completed
- `M3`: completed
- `M4`: completed
- `M5`: completed
- `M6`: paused after architectural review

## Development

```bash
npm install
npm run dev
npm test
```

## Current Scope

The repository currently contains the stabilized foundations through M5, plus PRD-aligned cleanup work for the next phase:

- Electron + React + Tailwind + TypeScript scaffold
- Main, Dock renderer, Panel chrome, animation layer, and panel menu entry points
- Config store with backup handling and safer replace-based persistence
- Basic file logging
- Dock window pinned to the right edge at `44px`
- Dock icon list driven by `config.panels`
- Dock footer actions for `+`, `⋮`, and `×`
- Hover-open web panel flow with sticky behavior and cross-icon switching
- Title-bar actions, panel menu, add/edit site flow, site info, favicon fetching, and browser selection
- Tray-based hide/show flow from the Dock close button
- Node-based regression tests for shared utilities and selected main/renderer behaviors
