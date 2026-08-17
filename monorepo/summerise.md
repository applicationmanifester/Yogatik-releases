# Monorepo Summary

Cross-platform notes app: a **web** app and an **Electron desktop** app that share
business logic and a UI library. Managed with **pnpm workspaces + Turborepo** and
wired together via **TypeScript project references**. 63 files; all JSON/YAML
validated and every `.ts`/`.tsx` syntax-checked.

## Structure

```
apps/
  desktop/   Electron + React + Vite — secure IPC, auto-update, tray, deep links
  web/       React + Vite — PWA
packages/
  shared/    api client (zod-validated), schemas, utils, constants, types
  ui/        Button / Input / Modal + design tokens (+ Storybook)
  config/    tsconfig base, ESLint, Prettier, Tailwind preset, Vitest preset
tools/       component generator
docs/        architecture, getting-started, shared-packages, deployment
.github/     ci.yml (PR checks) + release.yml (web deploy + signed desktop)
```

## Requirement coverage

- **Workspace** — pnpm + Turborepo; root scripts (`dev:web`, `dev:desktop`, `build`,
  `lint`, `test`, `typecheck`, `format`); solution `tsconfig.json` references all projects.
- **Code sharing** — `composite: true` project references, `@shared/*` + `@ui/*` path
  aliases (in both `tsconfig` and Vite config), explicit `exports` subpaths, `workspace:*`
  internal deps.
- **shared** — framework-agnostic (no React): `api`, `schemas`, `utils`, `constants`,
  `types`, with a Vitest test.
- **ui** — Vite library build (ESM + types), 3 components + tokens + a Storybook story.
- **web** — Vite + React + PWA + Tailwind (shared preset).
- **desktop** — `vite-plugin-electron`; **secure IPC**: `contextIsolation: true`,
  `nodeIntegration: false`, `sandbox: true`, typed `contextBridge` (`window.acme`);
  auto-updater, native menu, tray, single-instance lock, deep linking, file associations,
  `electron-builder.yml`, `entitlements.mac.plist`.
- **CI/CD** — `ci.yml` (install → build → lint → typecheck → test) and matrix `release.yml`
  (web deploy + signed NSIS/DMG/AppImage published to GitHub Releases with auto-update manifest).

## Best practices applied
- One-way dependency graph, no cycles (`config ← shared ← ui ← apps`).
- Explicit package exports — no deep `src/` imports.
- `workspace:*` version locking; per-app env files (`.env.web`, `.env.desktop`).
- React kept external in the UI library build.

## Run it
```bash
corepack enable && pnpm install
pnpm build          # builds packages in project-reference order
pnpm dev:web        # or: pnpm dev:desktop
```

> Note: `pnpm install` was not run here (it pulls the Electron/Vite toolchains and needs a
> real OS/network target). Configs and sources were validated statically. Run the commands
> above on your machine to generate the lockfile and package `dist/` output.

## Optional enhancements not yet added
Changesets (versioning), full Storybook config in `packages/ui`, Playwright E2E,
shared TanStack Query client.
