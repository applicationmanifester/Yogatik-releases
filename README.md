# Yogatik Studio

**Standalone unrestricted AI agentic assistant & desktop environment** - Electron desktop app + CLI + bot integrations. Monorepo: `yogatik-monorepo` v12.0.0.

## Repository layout

| Path | What it is |
|---|---|
| `frontend/` | The application (Electron + React). See `CLAUDE.md` for project knowledge and session log. |
| `frontend/electron/` | Electron main process and bridges (`main.cjs`, `fsBridge.cjs`, ...). |
| `src/` | NestJS backend service (auth, documents, S3 storage, OCR worker). |
| `cors-proxy/` | Cloudflare Worker CORS proxy (`worker.js`). |
| `docs/` | Gap analysis vs Claude Code, plans, superpowers specs. |
| `.github/workflows/` | CI, desktop/electron releases, eval pipelines. |

## Getting started

```bash
npm run install:all    # install frontend dependencies
npm run dev            # Vite dev server
npm run electron:dev   # Electron dev mode
npm test               # unit tests (vitest via scripts/run-vitest.mjs)
```

## Scripts (root - all delegate to `frontend/`)

| Script | Purpose |
|---|---|
| `npm run dev` / `build` / `preview` | Vite dev server / production build / preview |
| `npm test` / `test:watch` | Vitest unit suite |
| `npm run lint` | ESLint |
| `npm run e2e` | End-to-end tests |
| `npm run build:electron` / `electron:build` | Package the desktop app |
| `npm run cli` | Run `frontend/bin/yogatik-cli.mjs` |
| `npm run bot` / `bot:telegram` | Bot gateway / Telegram bot |

## Requirements

- Node.js >= 18

## Key docs

- `CLAUDE.md` - project knowledge & session log
- `docs/gap-analysis-vs-claude-code.md` - gap analysis & roadmap (all 14 gaps implemented, 552 tests)
- `CHANGELOG.md`, `CONTRIBUTING.md`, `AI_MAX_UTILISATION.md`