# Getting Started

1. `corepack enable && pnpm install`
2. Copy `.env.example` → `.env` (and per-app `.env.web` / `.env.desktop`).
3. `pnpm build` once (populates `packages/*/dist` for the apps).
4. `pnpm dev:web` or `pnpm dev:desktop`.

## Troubleshooting
- *Types from `@acme/shared` not found* → run `pnpm build` (packages emit `.d.ts`).
- *Electron window blank* → check `VITE_DEV_SERVER_URL` is set by vite-plugin-electron.
- *Alias `@shared` unresolved* → aliases are declared in each app's `vite.config.ts`
  AND `tsconfig.json`; both must agree.
