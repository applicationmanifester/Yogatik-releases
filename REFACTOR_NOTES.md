# Refactor Notes

## Session: 25 Sep 2026 — "fix all" execution

### 1. styles.css split — DONE, verified
- 13,583-line single-file stylesheet → **12 ordered chunks** in `frontend/src/styles/`
- `frontend/src/styles.css` is now an `@import` shim — **zero consumer changes** (`main.jsx`, the `index.html` stylesheet link, and `buildGuards.test.js` all keep working)
- Split only at column-0 `/* */` section comments at brace-depth 0 — no rule ever cut in half
- **Verified**: chunk reassembly is byte-identical to the pre-split file (sha256); every chunk brace-balanced
- Pre-split original: `frontend/.ai_backups/styles.1790319652775.bak`
- Concurrent-editor note: `styles.css` was modified mid-session by a separate performance workstream (removed `backdrop-filter: blur(20px) saturate(180%)` ×2, `scroll-behavior: smooth`, `transform: translateZ(0)`; added `will-change: scroll-position`). The split was re-baselined on the updated content before writing.
- `@layer` architecture was **rejected deliberately**: unlayered styles beat layered ones in the cascade, which would silently change specificity behavior across all 13.5k lines.

### 2. Earlier-session work — verified as real
- `vite.config.js` LLM proxy: upstream `AbortSignal.timeout(120_000)`, drain backpressure, client-gone passthrough — confirmed present in file
- `db.js`: schema migrations version(1)–version(8) present, including the v8 `hash` index — confirmed
- Backups present in `frontend/.ai_backups/`

### 3. Correction of record
- `REFACTOR_NOTES.md` was previously claimed as written but did not exist on disk — created now (this file).

### 4. Tools lazy registry — NOT DONE, deliberately (evidence-based)
- `tools/index.js`: 1,646 lines; **123 statically imported tool modules ≈ 1.22 MB source**
- `getToolSchemas()` is synchronous and must stay sync for LLM requests
- `tools/schemaContract.test.js` asserts `typeof ALL_TOOLS[n]?.execute === 'function'` for **every registered tool** — an explicit sync contract enforced by tests
- A lazy registry would break that contract unless the test is weakened — not acceptable
- Proper path (staged, dedicated session): separate schema metadata from implementations across the 123 modules → generate a metadata-only module → make `executeTool` lazy-load via a manifest → update the contract test to assert lazy resolution + prewarm coverage
- Partial mitigation already exists: `tools/toolPrewarm.js` dynamically `import()`s heavy runtimes based on typing intent

### 5. App.jsx split — staged plan (evidence-based)
- `App.jsx` is 7,412 lines with **exactly ONE top-level function** (`App`, line 149) — all state, effects, and handlers are nested inside the component
- Zero trivially extractable pure helpers at top level; a big-bang rewrite would be reckless
- Staged extraction plan (each step behind a green test run):
  1. Extract self-contained leaf subtrees with no shared state (message rendering — `components/MessageBubble.jsx` already exists)
  2. Extract settings-modal state into a hook (`useSettings`)
  3. Extract chat input / upload area
  4. Extract per-feature views (`components/BillingPanel.jsx` / `DataDashboard.jsx` patterns already exist)
- ⚠️ `App.jsx` is under active concurrent modification (per git status) — coordinate before extracting

### 6. TypeScript strict — recommended against for now
- `src/` is `.jsx` (711 files); `tsconfig.main.json` covers electron main only
- Enabling strict on the renderer is a migration, not a config flip; it would surface thousands of errors at once
- Suggested incremental path: a leaf-scoped tsconfig with `allowJs` + `checkJs` first
