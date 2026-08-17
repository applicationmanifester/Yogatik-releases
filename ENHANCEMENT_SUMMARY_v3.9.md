# Enhancement Summary — v3.9

**App:** Yogatik (browser-first AI chatbot, PWA + Electron/Tauri desktop)
**Source constraints:** `Yogatik_document.pdf` (improvement roadmap) + `CLAUDE.md`
**Date:** 2026-08-16

---

## 1. What was selected, and why

The attached roadmap ranks its improvements by impact/effort. The two highest-priority items (★★★, High impact, **Low** effort, Phase 1 — "Core UX & Stability") both concern the same gap: **users get no feedback about tools running, and error messages are cryptic.** Roadmap checklist items #1 ("Add a ToolStatus component — fetch status from agent.js") and #2 ("Wrap every tool promise … reports to a global error hub and shows a toast") map to this directly, as does Pain-point 2.1 #4 ("show friendly message + View details that expands stack trace").

This was chosen over lower-priority items (bundle-splitting, CSP, sync, dark mode) because it is the best return per unit effort, is low-risk (purely additive), and independent research on agentic-chat UX supports it: perceived responsiveness depends far more on *visible progress and legible failure* than on raw latency, and standardised, actionable error surfaces are a baseline expectation in modern tools.

## 2. Feasibility (grounded in the existing code)

The codebase was already 80% of the way there, which is why effort is genuinely Low:

- `agent.js` already exposes `onToolStart`/`onToolResult` hooks and a `traceRef` with `running/done/error`.
- `errorLog.js` already ships a `diagnoseError()` classifier (auth / quota / model / network / context / webgpu) with human-readable title + suggestion.
- `ToolResultCard.jsx` already had a failed-result branch — it just dumped `result.error` raw.

So the enhancement *reuses* those primitives rather than adding new machinery or dependencies.

## 3. What changed

| File | Change |
|------|--------|
| `src/toolStatus.js` *(new)* | Pure, DOM-free pub/sub hub: `beginTool` / `settleTool` / `subscribeToolStatus`, timing, `isLongRunning`, `friendlyError`. Forwards failures to `errorLog` + `diagnoseError`. Auto-prunes. |
| `src/components/ToolStatusPanel.jsx` *(new)* | Live "ready / loading / failed" panel: elapsed timer on slow tools, friendly failure line, Retry + Dismiss, `aria-live="polite"`. Renders nothing when idle. |
| `src/toolStatus.test.js` *(new)* | 7 unit tests. |
| `src/components/ToolResultCard.jsx` | Failed branch → `ToolErrorCard` (diagnosed title + suggestion, collapsible **View details** with raw error + Copy). |
| `src/agent.js` | Round loop calls `beginTool`/`settleTool` (2 additive lines). |
| `src/App.jsx` | Mounts `<ToolStatusPanel>` above the composer; Retry re-sends via `send()`. |
| `src/styles.css` | `.tool-status-*` / `.tool-error-*`, themed via existing CSS vars (light + dark). |
| `CHANGELOG.md`, `CLAUDE.md` | Metadata + shorthand knowledge entry. |

**No new dependencies.** No change to the tool execution path — only observation and presentation.

## 4. Testing

- **Unit (logic):** 7 assertions in `toolStatus.test.js` — running/done/error transitions, network diagnosis, unknown-id no-op, long-running threshold, unsubscribe, throwing-subscriber safety. All pass (verified under Node; add to the existing vitest suite → 322 total).
- **Syntax:** all five touched JS/JSX files parse cleanly under esbuild.
- **Note:** the repo's `node_modules` is a Windows install; running `npm test` on a non-Windows machine hits the known rollup native-binary issue. On Windows, run `cd frontend && npm test -- toolStatus`.
- **Recommended UAT:** trigger a failing tool (e.g. `web_extract` on an unreachable URL) and confirm: panel shows running → failed, friendly line appears, View details expands the raw error, Retry re-sends. Confirm contrast in both themes and keyboard reachability of the toggle/Retry.

## 5. Roadmap for subsequent enhancements

Following the document's own prioritisation:

1. **Now (done):** Tool status + standardised errors — *this release*.
2. **Phase 2 — Performance & Security:** move Pyodide to a dedicated Web Worker with on-demand load; `getDB()` singleton; add CSP via `firebase.json` + meta; `sanitise()` (DOMPurify) for external HTML before DOM insertion. KPI: bundle ↓30%, mobile load < 2s.
3. **Phase 3 — Feature Expansion:** export/import UI (reuse `chatExport.js`); dark-mode toggle persisted; privacy-first analytics hooks.
4. **Phase 4 — Desktop & Deployment:** enforce `sandboxRoot` + reject `..`/absolute in `fs_*` IPC; auto-updater hardening.
5. **Phase 5 — Continuous Improvement:** new tools, security audit to A-grade, tool success rate ≥ 99%.

Each subsequent item should repeat the same loop: verify against current code, confirm feasibility, implement additively with tests, and update `CHANGELOG.md` + `CLAUDE.md`.
