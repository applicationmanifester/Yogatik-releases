# Architecture

## Goals
- One codebase, two runtimes (browser + Electron), maximal shared code.
- Strong type-safety edge-to-edge (zod at the API boundary, TS everywhere).
- Fast incremental builds via TypeScript project references + Turborepo caching.

## Dependency graph (no cycles)
```
config  ← shared ← ui ← web
                    └──── desktop
config  ←──────────────── web, desktop, shared, ui
```
- `config` depends on nothing (presets only).
- `shared` is framework-agnostic (no React).
- `ui` depends on `shared` + React (peer).
- `apps/*` depend on `shared` + `ui`.
- **Rule:** dependencies point one way. An app never imports another app; a
  package never imports an app.

## Boundaries
- **shared** must not import React or DOM-only APIs — it runs in the Electron
  main process too.
- **ui** owns all React components and design tokens.
- **Electron security:** `contextIsolation: true`, `nodeIntegration: false`,
  `sandbox: true`; the renderer only sees the typed `window.acme` bridge.

## Why these tools
- **pnpm** — content-addressed store, strict node_modules, first-class workspaces.
- **Turborepo** — task graph, caching, `--filter` for affected-only runs.
- **Project references** — incremental `tsc -b`, enforce package boundaries.
