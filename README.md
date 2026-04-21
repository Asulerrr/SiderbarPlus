# Sidebar Plus

Electron-based Windows sidebar app scaffolded from the product PRD.

## Milestone Status

- `M1`: in progress

## Development

```bash
npm install
npm run dev
```

## Current Scope

The repository currently contains the M1 foundation:

- Electron + React + Tailwind + TypeScript scaffold
- Main, Dock renderer, and Panel renderer entry points
- Config store with atomic writes and backup handling
- Basic file logging
- Dock window pinned to the right edge at `44px`
