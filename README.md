# Sidebar Plus

Electron-based Windows sidebar app scaffolded from the product PRD.

## Milestone Status

- `M1`: completed
- `M2`: completed

## Development

```bash
npm install
npm run dev
```

## Current Scope

The repository currently contains the M1 and M2 foundations:

- Electron + React + Tailwind + TypeScript scaffold
- Main, Dock renderer, and Panel renderer entry points
- Config store with atomic writes and backup handling
- Basic file logging
- Dock window pinned to the right edge at `44px`
- Dock icon list driven by `config.panels`
- Dock footer actions for `+`, `⋮`, and `×`
- Quick menu for auto-launch toggle, settings placeholder, and about placeholder
- Tray-based hide/show flow from the Dock close button
