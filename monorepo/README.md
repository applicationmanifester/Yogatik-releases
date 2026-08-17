# Acme Monorepo

Cross-platform notes app: a **web** app and an **Electron desktop** app sharing
business logic and a UI component library. Managed with **pnpm workspaces** +
**Turborepo** and wired together with **TypeScript project references**.

```
apps/
  desktop/   Electron + React + Vite (secure IPC, auto-update, tray, deep links)
  web/       React + Vite (PWA)
packages/
  shared/    api client, zod schemas, utils, constants, types
  ui/        Button / Input / Modal + design tokens (+ Storybook)
  config/    tsconfig base, ESLint, Prettier, Tailwind preset, Vitest preset
tools/       generators & scripts
docs/        architecture & guides
```

## Prerequisites
- Node >= 18.18, pnpm 9 (`corepack enable`)

## Setup
```bash
pnpm install
pnpm build          # builds packages first (project-reference order)
```

## Develop
```bash
pnpm dev:web        # Vite dev server for the web app
pnpm dev:desktop    # Electron window with HMR
```

## Common tasks
```bash
pnpm lint
pnpm typecheck
pnpm test
pnpm format
```

## Adding shared code
See `docs/shared-packages.md`. In short: put framework-agnostic logic in
`@acme/shared`, reusable components in `@acme/ui`, then import via the package
name (`@acme/shared/utils`) — never a deep `src/` path.

## Internal dependencies
Always `workspace:*`, e.g. `pnpm add @acme/shared --filter @acme/web`.

## Release
- **Web** → `apps/web/dist` deployed by `.github/workflows/release.yml`.
- **Desktop** → signed NSIS / DMG / AppImage published to GitHub Releases with
  an auto-updater manifest (`latest*.yml`). See `docs/deployment.md`.
