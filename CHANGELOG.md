# Changelog

## [13.0.0] — 2026-10-19: Next-Gen AI Agentic Assistant, Unified Live Studio & Multi-Platform Core

Major milestone release synchronizing the unified web studio, standalone privacy browser, desktop applications (Windows, macOS, Linux), and native mobile applications (Android APK, iOS IPA).

### 🚀 Highlights
- **Single-Bar Live Cockpit Redesign**: Centralized call controls into an ergonomic bottom command bar, dedicated top status strip, accessible secondary controls sheaf, and independent artifact rail.
- **Enhanced Live Capture & Vision**: Real canvas-level digital zoom (1-4x), hardware camera torch integration, Laplacian variance stride-sampled autofocus (sharpest-of-3 frames), and real-time battery/thermal monitoring.
- **Yogatik Browser Chromium Privacy Stack**: Encrypted DNS (DoH + ECH), conservative CSP injection, cookie container partitions, and origin storage inspection and scoping wipe.
- **Post-Call Recap Briefs**: Leave-behind briefing card capturing executive summaries, action items/todos, created artifacts, and cited sources directly to the conversation.
- **Multi-Platform Deployment & CI/CD**: Unified version 13.0.0 rollout across Web, Windows NSIS, macOS DMG, Linux AppImage/deb, Android APK, and iOS IPA.

## Live capture quality — torch, real digital zoom, sharpest-of-3, battery sampling (2026-10-18)

Horizon-2 capture-quality sprint for the hands-busy user (dark rooms, tiny pill labels, distant objects), all edits marked `[live-capture]`. All pure logic in ONE new module (`frontend/src/live/capture.js` + its test); `LiveView.jsx` is wire-only (one command-bar button + one small sheaf section), and the telemetry lands in `live/metrics.js` following its existing counter patterns — coarse 10% buckets, counts and numbers only, content-free on the same terms as the rest.

- **Torch** — `torchSupported(track)` (honest detection: `getCapabilities().torch === true`; a missing/throwing `getCapabilities` and screen-share tracks read as unsupported) and `setTorch(track, on)` via `applyConstraints({ advanced: [{ torch }] })`, returning a typed `{ ok, reason }` instead of throwing so a hardware refusal is spoken, never pretended. LiveView detects support whenever the camera (or a flipped) track goes live: the torch button appears in the command bar — and the new sheaf section — ONLY when the hardware honestly reports it. The low-light refusal is now actionable: in the vision panel, when `vision/readable.js` flags a dark frame AND the torch exists, the refusal upgrades to "Too dark — tap the torch" instead of `live/visionGuard.js`'s generic shrug (the honest refusal still stands without a torch).
- **Digital zoom (the kind the model sees)** — `zoomPlan(baseDims, zoom, crop)` is a pure grab-rect builder: centre-cut at 1..4×, stacking the capture profile's crop fraction multiplicatively, clamped, and edge-guarded so no crop goes below 240px — the grab encoder never upscales, and a tiny slice cannot be read by anyone. It is applied INSIDE `live/video.js` `grab()` before the encode, so the model, OCR, the `see` tool and the object-detection HUD all see the zoomed pixels — the difference vs CSS zoom, which enlarges only what the user sees. LiveView gets a 1..4× slider in a new "Capture & light" sheaf section (camera-only; zoom resets when the camera leaves so it can never silently zoom a later screen capture), a pinch-to-zoom on the preview via two-touch pointer events, and a preview transform that mirrors the zoom the model actually receives.
- **Sharpest-of-3** — `laplacianVariance()` (stride-sampled focus score), `pickSharpest()` (ties lose to the earlier frame; an unscorable frame never deletes the first grab) and `sharpestFrame(grab, { count, gapMs, decode })` (three grabs ~350ms apart — the re-focus slack — with an injectable decoder so node tests exercise the pure fallback). Wired into the describe/OCR path ONLY: cascade's `describeIfVisual` (model-blind Live turns) and the vision panel's on-device branch now answer from the best frame, not the first grabbed — a mid-autofocus grab is exactly the one that turns a pill imprint into OCR noise. The frame-send to real vision models (`visualParts`) is untouched.
- **Battery/heat sampling (LIVE_ROADMAP §8, measured at last)** — `sampleBattery()` (the `navigator.getBattery` guard lives here; null on missing platforms and refusals, never throws), sampled per-minute by LiveView; `metrics.js` gains `recordBatteryLevel()` (ring-capped at ~2h, stored as coarse 10% buckets 0–10, unknown readings recorded nowhere) and `batteryStats()` — `{ samples, buckets, lowRate }` — surfaced in `report().battery` beside the other counters. Time spent at/below 20% while on a call is the number the roadmap wanted.
- **Tests & verification** — `src/live/capture.test.js` (39 tests: zoom state/clamps/plans including the 720p-caps-at-3× edge guard and profile-crop stacking, torch honesty under missing/throwing platforms/applyConstraints refusals, Laplacian scoring including the stride-2 aliasing corner, sharpest-of-3 fallbacks, low-light hint shapes, battery bucketing; plus wiring pins — zoom at the grab canvas not CSS, sharpestFrame in the describe path, torch/slider/pinch/battery in LiveView). `metrics.test.js` gains the battery behaviour (buckets, unknown ignored, 2h cap, live-session visibility). `node ./scripts/run-vitest.mjs --run src/live/capture.test.js src/live/metrics.test.js src/live/trust.test.js src/buildGuards.test.js` → **78 passed / 1 failed**, the one failure being the reachability check flagging two OTHER concurrent tracks' unwired modules (`src/live/offline.js`, `src/live/stepMode.js`) — untouched by this change; this sprint's own modules (capture.js included) verify as reachable. The full Live-adjacent run (capture + metrics + trust + LiveView cockpit + cascade): **105 / 105 passed**. ESLint on every touched file: **0 errors** (10 pre-existing warnings). `npx vite build` → **exit 0** (LiveView chunk 120.60 kB, gzip 36.66 kB; only pre-existing chunk/circular notices).

## yogatik-browser — Chromium privacy & network stack: encrypted DNS, CSP injection, cookie containers, storage audit (2026-10-18)

Browser-track upgrade, all edits marked `[chromium-privacy]`. One new module (`yogatik-browser/electron/privacyStack.cjs`) owns four capabilities; main.cjs gets exactly two delimited hooks plus a four-line header-composition hook, everything else additive (preload bridge, toolbar popover, settings defaults, tests).

- **Encrypted DNS (DoH + ECH)** — `buildDnsSwitches()` is a pure spec builder over `privacy.dns { mode: 'off'|'secure'|'auto', template }`: `off` emits nothing, `secure` (default) pins `DnsOverHttpsMode=secure` (never falls back to plaintext DNS), `auto` prefers DoH, and both enable `EncryptedClientHello`; templates default to Cloudflare + Google and honor a custom string. `enableSecureDns()` appends the switches at main.cjs MODULE TOP-LEVEL because Chromium command-line switches only bind before `app.ready`. An optional conservative CSP can now be injected for hosts the user allow-lists (`privacy.cspInjection`, **off by default**): `decideCsp()` is pure — inject only when the response has NO CSP of its own (any casing, report-only included) and the host is public http(s) (file://, devtools://, yogatik://, localhost/LAN always exempt). Because Electron allows ONE `onHeadersReceived` listener per session, injection rides the existing `applyCSP` handler via `withOptionalCsp()` instead of a second listener that would silently replace it; container sessions (no other listener) use the standalone `installCspInjection()`.
- **Container tabs** — `createContainerSessions()` maps validated ids to `persist:container-<id>` partitions (stable across restarts, unique, path-traversal ids refused); per-container user agents are opt-in (`privacy.containers.distinctUserAgents`, default off). `openInContainer()` reuses browserControl's native partition support in `createTab()` and stamps `tab.containerId` for per-tree-node assignment; IPC (`privacy:containers-list/-create/-open`), a `__privacy` preload bridge, and a minimal toolbar popover ("New tab in container" + create) are wired, heavy UI left as follow-up.
- **Origin storage audit** — pure `groupCookiesByDomain()` (dot/case merge, count-sorted), `auditOriginStorage()` with the storage estimate only when `session.getStorageData()` exists, and `wipeOrigin()` with bidirectional dot-boundary scoping (`.youtube.com` ↔ `www.youtube.com` wipe together; `notyoutube.com` never matches) + origin-scoped `clearStorageData`. Surfaced in the same popover with per-origin Wipe buttons.
- **Settings** — `privacy` defaults extended with `dns`/`cspInjection`/`containers` blocks; the store's atomic-write + `structuredClone(DEFAULTS)` discipline is regression-guarded (arrays REPLACE defaults, never merge element-wise; factory DEFAULTS never mutated).
- **Tests** — `tests/privacyStack.test.cjs` (29 tests: DoH matrix, CSP decision matrix incl. scheme/LAN exemptions, partition stability/uniqueness, UA opt-in, tab stamping, audit grouping, wipe scoping, defaults merge/pollution guard, end-to-end IPC through the stub registry) folded into `tests/run-tests.cjs` as section 4. **npm test → 78 passed / 0 failed**; `node --check` clean on every touched module. Details: `yogatik-browser/IMPROVEMENTS_2026-10-18.md`.

## Live cockpit redesign — the stage becomes the hero, the call is driven from ONE bar (2026-10-18)

Presentation-only redesign of the Live experience (pure markup/CSS on top of the already-shipped live wiring — gemini/cascade sessions, metrics, guards and the LiveSettings voice/engine dropdowns are untouched; every handler was moved verbatim from the old badges row / controls dock into the new surfaces, marked `[live-redesign]`). The `[live-autoswitch]` / `[proactive]` / `[tv-voice]` / `[citations]` regions were preserved untouched.

### The new chrome (`components/LiveView.jsx`)
- **Top status strip `.live-cockpit-top`** — status ONLY, zero controls: provider pill (with the ready-dot), model pill, and the scene badges (Screen / Watching Live / Auto-Scan 10s / Object HUD) copied verbatim from the retired `.live-badges` row; the latency SLO badge + "Voice latency high → text mode" nudge moved here out of the orb area (props verbatim, still `role="status"`). A11y fix: the "Silent Live" badge was a clickable `<span>` — now a real `<button>` wired to the same `toggleSpeaker`.
- **Bottom command bar `.live-cockpit-bar`** — the ONE place the call is driven from: mic, camera, screen, stop (when the model is thinking/speaking), end, and a dashed **More hub** (`aria-haspopup="dialog"`, `aria-expanded`, `aria-controls="live-cockpit-sheaf"`) that chips the artifact count via the reused `.live-btn-badge`. Fresh `.live-cb-btn` class + `is-off`/`is-engaged`/`is-stop`/`is-end`/`is-hub`/`is-open` states so the legacy 32px `.live-btn` cascade (08 beats 03 at equal specificity) can never fight the sizing.
- **The "more" sheaf `#live-cockpit-sheaf`** — every secondary control behind ONE hub, in four sections (Panels & tools: transcript/artifacts rows, snapshot, camera&mic, Live settings, model search, auto-pick fastest; Scene & watching: vision-mode cycle, auto-scan + object-detect (verbatim feed-gated), flip camera; Sound & captions: speaker mute, captions, Fast Voice/Neural HD toggle; Call setup: the provider & model glass dropdowns **moved verbatim with their refs intact**, plus the view-mode group and theme row). `role="dialog"` `aria-modal="false"`; Escape closes and refocuses the hub, Tab is trapped inside while open, and the hub is `aria-expanded` on the state. Rows that open a docking surface close the sheaf and hand focus to that surface (`closeSheafAndFocusSurface`); the provider/model dropdowns get a `position: static` override inside the sheaf so they flow instead of clipping.
- **Artifact rail `#live-artifact-rail`** — artifacts now dock as their OWN rail (renders in cinema mode; dock/PiP keep their own mounts) instead of being a transcript-drawer tab. The rail closes back to the command-bar hub (`commandBarFocusReturn`). The `LiveDockOverlay.onSelectArtifact` handlers now close the transcript drawer when surfacing an artifact — one surface at a time.
- Root `.live-view` gains `live-drawer-open` / `live-rail-open` (alongside the legacy `has-side-panel`) so CSS can shift the arena; desktop keeps the -210px shift from 03 and adds a wider shift when BOTH surfaces are open.

### Transcript drawer (`components/LiveTranscriptPanel.jsx`)
- Now a pure transcript surface: `id="live-transcript-drawer"`, `role="complementary"`, own close button in the header, a **"Jump to live"** nudge driven by the existing `userScrolledUp` logic, and a **last-200 window** (older history stays searchable — the filter runs over the FULL transcript; the rendered window re-offsets indices so the `copiedIdx` copy-feedback contract is unchanged). The duplicated filter row (header + body copy) is deduped to one; the artifact tab block and its unused `ToolResultCard`/`LiveArtifactStage` imports are gone. Empty state added.

### CSS (`styles/13-live-components.css`)
- The whole cockpit chrome lives here, styled with the 16-design-tokens contract (`--space-*`, `--radius-*`, `--shadow-*`, `--dur-*`, `--control-h-*`, `--ease-out-quint`) and the existing `--live-*` glass variables; `prefers-reduced-motion` kills every added transition/keyframe. Device variants are CSS-only off `[data-device]` (deviceClass.js): sheaf = right panel (laptop/desktop) / bottom sheet (mobile/tablet, pinned above the command bar) / wide focus grid (TV); transcript = right drawer / bottom sheet / **TV lower-third** with its own arena shift; artifact rail = right rail / overlay card / corner card. Z bands: sheaf 40, command bar 30, strip 20, rail 16 (above the drawer's 15).
- First-class chrome for components that had none: `.live-settings-*` (sheet, groups, selects, segmented vision control, toggle switch with `:focus-visible` rings on the track) and `.live-artifact-*` (stage/header/content), plus `.live-transcript-item` cards (user indigo / assistant accent) that the old markup never had.
- `styles/08-a-running-agent-command-reported-o.css`: the 13 `.live-pill-*` rules and the `livePillSlideUp`/`orbPulse`/`orbSpin` keyframes are deleted (retirement banner comment in place; the legacy `.live-btn` rules below stay for the dock/PiP companions).

### Deleted
- **`components/LivePill.jsx`** — the always-on mini dock duplicated every command-bar control and was not part of the LiveView wiring. Both `buildGuards.test.js` allowlist entries removed (git-tracked — `git show HEAD:frontend/src/components/LivePill.jsx` recovers it).

### Tests & verification
- `LiveView.test.jsx` extended with 4 cockpit tests: command-bar primary controls + hub dialog semantics; sheaf open/close via hub with `aria-expanded`/`aria-hidden` mirroring + the transcript row's `aria-controls`; **Escape closes the sheaf and focus returns to the hub**; opening the transcript drawer from the sheaf (drawer mounts as `role="complementary"`, sheaf yields, close returns focus to the hub).
- `node ./scripts/run-vitest.mjs --run src/buildGuards.test.js src/components/LiveView.test.jsx src/components/LiveModelSearchModal.test.jsx src/live/metrics.test.js src/live/trust.test.js` → **44 passed / 2 failed**, the 2 failures being pre-existing `LiveModelSearchModal` expectations ("Search & Switch AI Model" / "Search by model name" — neither string exists in the component at HEAD either, so the test was already red before this change).
- ESLint on `LiveView.jsx` / `LiveTranscriptPanel.jsx` / `LiveView.test.jsx`: **0 errors** (4 pre-existing unused-destructure warnings in LiveView).
- `npx vite build` → **exit 0**; LiveView chunk 101.40 kB (gzip 30.27 kB); no chunk-size warnings beyond the pre-existing circular-chunk/dynamic-import notices.

## No-feature-nobody-can-reach sweep — BUILT, NEVER WIRED allowlist resolved (2026-10-18)

Every entry in `buildGuards.test.js`'s "BUILT, NEVER WIRED" allowlist got a decision: wired for real, or deleted with its tests. Two items **WIRED** (they left the allowlist because the reverse check forbids entries for reachable files), **twelve modules DELETED** (superseded duplicates), two **kept deliberately**, one removed from the list by the concurrent live track (LivePill).

### WIRED
- **`tools/stagehandHealing.js` → `tools/browserControl.js` [stagehand-healing]** — the browser tool refuses a stale element ref (never clicks blind), but the refusal cost the model a turn even when the element was still on the page under a new ref. `browserControl` now remembers what a ref used to name (every tree the chat is handed is parsed once — `parseTreeRefs` accepts both `role "label" [ref_epoch_i]` and `[ref] label` line shapes) and, when a stale-ref action arrives, resolves the replacement with stagehandHealing's progressive matcher and retries **once**: only on an **exact, uniquely-named accessible-name match** — ambiguous or fuzzy-only matches surface as candidate hints for the model instead of an auto-click. The retry carries the same action, args and consent flags; a healed result reports `self_healed: {from, to, strategy}` (schema description tells the model to treat it like a normal success); if even the healed ref goes stale again, the fresh tree still rides along. Old contract kept: no prior read ⇒ no memory ⇒ refusal + fresh page exactly as before. **Tests**: `browserActions.test.js` +4 (heal on unambiguous rename, ambiguous name = refusal not a guess, fuzzy match = hint via `resolveHealedRef` unit, stale-ref/ordinary-failure behaviour unchanged); `stagehandHealing.test.js` unchanged (pure fns untouched).
- **`chatSearch.js` → `components/CommandPalette.jsx`** — the sidebar's universal "Search & Commands" (Ctrl+K) is the search entry the user can actually reach, and App's `openChatById` existed precisely for "the palette searches messages, which know their conversation but not its position in the sidebar" — yet only conversation titles were ever searched. The palette now runs `searchChats` (BM25 over every stored message body, indexed once per burst with incremental catch-up) against the same query, debounced 150 ms, into a conversational "Conversations & Message Matches" section; selecting a message hit jumps to its conversation through the existing `onOpenChat`. `App.jsx` untouched. `chatSearch.test.js` (index/ranking/caching) unchanged and green.

### DELETED (all git-tracked — `git show HEAD:<path>` recovers each)
- **`responseCache.js`** — semantic exact-duplicate answering (30-min TTL) wanted an agent.js pre-turn hook, and agent.js is mid-flight in a concurrent track; answering a current-events question from a stale copy is the failure mode no default-ON toggle should carry until it is wired deliberately. Delete first, wire later behind a `features.*` flag if wanted. (instruction's "if agent.js is too contended" branch)
- **`components/FileBrowser.jsx` + `components/FilePicker.jsx` + `tools/fsFacade.js`** — superseded duplicates: the workspace dock users actually reach is `App → WorkspacePanel` (ExplorerPanel file tree, WorkspaceSearch content search, CodeEditorPane), and fsFacade was a thin re-wrap of localFs's own invoke helpers. FileBrowser additionally used Next.js `<style jsx>` scoping that never worked under Vite.
- **`experiments.js`** + the experiments half of `phase1.test.js` — `getVariant`/`trackOutcome` had no caller. The file dropped to its surviving halves: `adaptation` and the `analyticsSink` tests (analyticsSink itself is wired via `analyticsConsent`/AnalyticsToggle and correctly absent from the allowlist).
- **`components/McpModal.jsx`** — retired wrapper; MCP servers are hosted directly in DashboardShell/App's dashboard nav.
- **`stores/{chatStore,uiStore,index}.js`** — a never-imported state-manager barrel duplicating state App.jsx owns live (e.g. a literal `pendingToolResultsMap` copy).
- **`hooks/useA11y.js`** — superseded by the wired `components/A11yAnnouncer.jsx` (App, VisionModal and StreamingMessage all use `announce`/`announceAssertive`).
- **`hooks/usePyodide.js`** — the wired Pyodide client is `workers/pyodideWorkerClient.js`, used by `tools/codeExec` ("codeExec runs outside React, so it cannot use hooks/usePyodide"); the React hook had no consumer.
- **`agent/agentTypes.js`** — agent.js owns its own state shapes; these classes were imported by nothing.
- **`companion/CadenceIndicator.js` + `CadenceIndicator.module.css` + `companion/useAdaptivePolling.js`** — a Math.random demo of adaptive polling plus its hook, while the real wiring already exists where real observations live: `companion/liveWatch.js` calls `adaptive.noteObservation`/`describeCadence` inside the companion's watch loop and the brain's `summary()` reports the true cadence. Deleted with `useAdaptivePolling.test.js`.

### Kept deliberately
- **`downloadConsent.js`** — the consent plumbing behind the `features.*` consent toggles; covered by `enhancements.test.js`. Allowlist line stays together with the module.
- **`components/ComfyPanel.jsx`** — removed from PersonalisePanel at the user's request and kept deliberately unrendered, AdModal-style; comfy.js + the local generation tools work unattended.
- **`LivePill.jsx`** — removed from the allowlist by the concurrent live track (deleted, both lists) — not this sweep's file to touch.

### Verification
- `node ./scripts/run-vitest.mjs --run src/buildGuards.test.js src/tools/tools.test.js src/tools/toolRegistry.test.js src/browserActions.test.js src/tools/stagehandHealing.test.js src/phase1.test.js src/chatSearch.test.js` → **7 files, 102 tests, all green** (buildGuards' two reachability tests included; the reverse check now guards every wired file). Deleted-module references: zero (`git grep` + textual sweep).
- ESLint on all touched files (`buildGuards.test.js`, `phase1.test.js`, `browserActions.test.js`, `tools/browserControl.js`, `components/CommandPalette.jsx`): **0 errors** (5 pre-existing unused-import warnings in CommandPalette predate this change).
- `npx vite build` → **exit 0**. Chunk deltas: nothing shrank — every deleted module was dead code that no chunk ever bundled; the lazy `CommandPalette` chunk (15.16 kB) absorbs chatSearch+retrieval on demand and `stagehandHealing` rides the browser-tools chunk.

## Local audit trail + export — every consequential decision leaves a receipt (2026-10-18)

### The honest local foundation for the "enterprise audit & export" theme
- **Scope, stated up front (`auditTrail.js`)** — what the roadmap's audit-export story NEEDS a backend for (RBAC, team roles, org retention, cross-device trails, server-side non-repudiation) is explicitly out of scope and not here; what IS here is the client-side half that works today: an append-mostly, **hash-chained ring buffer (500 entries)** in the Dexie `settings` key `audit_trail`, plus inspect/verify/export/wipe UI. Tamper-**evident**, not tamper-**proof** — the log lives on the user's machine and the user owns the machine (documented in the module header, and the panel says the RBAC line too).
- **Core (`auditTrail.js`, `+ tests`)** — `record(type, detail)` **never throws and never breaks its host** (a sequential writer promise chain keeps concurrent records chained correctly; failures resolve `null`); chain hash = **SHA-256(prevHash + canonical entry JSON)** via `crypto.subtle` with a `plainHash` fallback when WebCrypto is off; `verifyChain()` is a pure recompute returning `{intact, brokenAt, length}` — capped-ring semantics documented in place (the oldest retained entry's `prev` is opaque past the eviction boundary; every retained entry's hash and every retained link still verify). `queryEvents({type, since, until, limit})` (newest-first), `wipeTrail()` (clears, then the wipe itself becomes the first entry of the new chain so the trail self-describes), and pure export builders: `auditToJson` (versioned `yogatik-audit-trail` payload **with chain fields** so a recipient can re-run the verify) and `auditToCsv` (RFC-4180 quoting), downloaded through `chatExport.downloadBlob` via `exportAudit('json'|'csv')`.
- **Sanitisation is the feature, not an afterthought** — `sanitizeDetail` runs on EVERY record: body-carrying keys (`args`, `command`, `content`, `prompt`, `diff`, `description`, paths, and content-describing ids) are dropped outright, strings capped at 120 chars, arrays at 12, objects at 16 keys, depth 2 — so a hook author passing a full permission result (args bodies, command lines, the whole diff preview) gets silently reduced to coarse booleans/ids. The sanctioned vocabulary (`EVENT_TYPES`): `tool_permission_roll`, `schedule_created/paused/resumed/cancelled/ran`, `data_export/import`, `prefs_push/pull`, `key_vault_pull`, `cloud_sync`, `mcp_toggled` (type supported for callers; hook budget spent this feature), `audit_wiped`.
- **Hooks (delimited `[audit]` blocks, ≤4 files, App.jsx untouched)** — `permissions.js`: `requestPermission` is now a thin wrapper around `_requestPermission` so EVERY roll (settings preference, saved rule, user allow/deny, fail-closed) lands as `tool_permission_roll {tool, allowed, how}` — "how" decoded from the app-authored reason strings ("user" | "rule" | "settings" | "fail-closed", degrading to "unknown" if wording drifts, never a lie); `scheduler.js`: create/pause/resume/cancel/run record schedule id (+ cadence kind / run timestamp), never workflow names or payloads; `chatExport.js`: the single `triggerDownload` path records `data_export {ext}` (extension only — titles and content never recorded, and this self-audits the audit trail's own exports), `importConversationFile` records `data_import {messages}` (count only); `api.js`: `syncCloudKeys` → `key_vault_pull {pulled, pushed}` counts only, and `syncCloudData` records `cloud_sync {pulled, synced}` plus `prefs_pull`/`prefs_push` outcomes — no provider ids, no key material, no payload shapes. All hooks are fire-and-forget and try/catch-isolated: a failing trail is never the user's problem.
- **Panel (`components/AuditPanel.jsx`, mounted in Settings → Privacy & Sync next to the analytics toggle in `SyncTab.jsx`)** — table of the last 30 events (tabular time chip, type-label chip, coarse detail one-liner), **Verify integrity** (intact / "broken at #k" through the real recompute), **Export JSON / Export CSV**, and a **two-step Wipe** (no `window.confirm()` — arm, then "Confirm wipe", then the trail re-read shows the wipe entry alone with `verifyChain` intact immediately after); `aria-live` status line throughout.
- **Tests (77 green across the touched suites)** — `auditTrail.test.js` (25, real module over a mocked db with genuine getSetting semantics + Node's real WebCrypto): ring cap keeps the newest 500 and stays chained across eviction, genesis anchoring + per-entry prev continuity, verify pins intact/empty, and detects type/detail/prev mutations plus clobbered hashes at the right index; payload-vs-body sanitisation (args bodies, commands, diffs, cycles, functions, bogus strings all reduced or dropped); host-failure isolation (storage exploding → `record` resolves null and the next record chains unharmed; WebCrypto-off fallback still verifies); concurrent-writer serialization; query filters; wipe self-description; export shapes (JSON with chain fields, CSV header/rows/quoting, real `downloadBlob` plumbing with dated filenames + failure → null). `AuditPanel.test.jsx` (7, @testing-library render against the real auditTrail over a mocked db): event rows render, empty state, intact + tampered-chain verify display, JSON export through the real download path (the export then appears in the trail, 4 rows), two-step wipe semantics, and a re-sanitisation display guard. `permissions.test.js`, `scheduler.test.js`, `chatExport.test.js`, `cloudSync.test.js`, `SettingsModal.test.jsx`, `ScheduledPanel.test.jsx`, `dbContract.test.js`, `buildGuards.test.js` stay green (the last also drops its stale `src/chatSearch.js` dead-module allowlist entry — CommandPalette now statically imports it, and the guard's own reverse rule forbids entries for reachable files).
- **Build** — ESLint clean on all touched files (0 errors; 4 pre-existing `api.js` unused-import warnings untouched); `vite build` exits 0 with `auditTrail` as its own 4.6 kB lazy chunk.

## Hybrid RAG inline citations — answers cite the passages they rest on (2026-10-18)

### The doc→model→answer→strip loop, one convention end to end
- **Pure citation kernel (`frontend/src/citations.js`, new)** — three side-effect-free pieces the whole loop rides on: `fuse()` (Reciprocal Rank Fusion, **k=60**, `score = Σ 1/(k + rank + 1)`) merges two ranked candidate lists (BM25 × semantic engine) with deterministic tie-breaking (equal RRF → best observed rank → appearance order), dedupes the same chunk returned by both engines (content keys `text`/`passage`/`id`/`key` first, true object identity as fallback), and is **additive by design: one engine absent ⇒ fused is simply that list** — a BM25-only day degrades to pass-through, never to corruption. `withCitationIds()` then stamps the fused rows with stable citation ids `[1]..[n]`. `extractCitations()` reads the same convention back out of a FINISHED answer — `[1]`, `[2,3]`, `[citation: 1]` (plus the numeric markdown-link label `[2](report.pdf)` counts, its definition line `[2]: https://…` does not, and fenced/inline code is swept first so JS never accidentally "cites") — returning unique ascending ids; `buildSourcesStrip()` pairs each cited number with its retrieved row into `{ count, items: [{ n, docName, chunk, of, preview, score }] }`, pre-white-spacing and 160-char-ellipsising the preview, returning `null` (caller hides) when nothing cited maps to a row. Legacy rows persisted before numbering existed fall back to list position, so old answers still build a strip.
- **Tool path (`tools/documents.js`)** — `doc_search`'s result, the object serialized into the model's context (agent.js `messages.push`, identical for prompted mode), now marks every passage with its bracketed number (`n: 1..k`, alongside doc name, chunk position and a rounded 2-dp `score` worth showing in the strip) and appends ONE instruction line: *"When using these results, cite the bracketed number, e.g. [1]."* (`citation_note`, the exact string exported as `CITE_INSTRUCTION`). Retrieval internals untouched — the ordering the model sees is still whatever BM25/`semanticRerank` produced; citations are purely additive numbering over it.
- **Plumbing (`App.jsx`, one `[citations]` hunk)** — a turn may call `doc_search` more than once, but the per-message tool result is keyed by tool name: a naive overwrite would restart numbering at `[1]` (colliding with numbers the model already cited) and drop call 1's passages from the strip. The `onToolResult` callback now renumbers repeat calls IN PLACE (the same object agent.js serializes into the second call's tool message — the delivery chain is synchronous, so the model sees `[k+1]…`) and stores an accumulated `passages` array, so every number the model cites keeps its matching row in the final persisted result.
- **Render path (`MessageBubble.jsx` + `components/CitationsStrip.jsx`, new)** — a memo derives the strip at render time from the finished answer text + `msg.toolResults.doc_search.passages` (the existing per-message tool-result state, so it survives reload — the numbered result is persisted with the message), and `<CitationsStrip/>` renders the chip row `[n] docName` ONLY for assistant answers that produced doc_search results this turn, with an expandable detail listing (preview, chunk n/of, score) behind a toggle. **Hidden outright when no cited number maps to a passage** — never an empty husk. Raw message text is never altered: extraction runs on the already-cleaned `answer`/adaptive-card text, not `msg.content`, and nothing writes back to the message or db. Numbering also shows on the ToolResultCard passage rows (`[1] … · chunk 2/9`) so the user sees the same numbers the model cited by.
- **Graceful on every edge** — answer citing a number the tool didn't return ⇒ that chip just doesn't render; zero results / no-hits tool output ⇒ no note, no strip; both engines empty ⇒ `fuse([], []) = []`.
- **Tests (39 new green)** — `citations.test.js` (29): RRF ordering with exact `1/(k+rank+1)` math, cross-list dedupe, single-engine pass-through (+ monotone scores), `[]/null/undefined` empties, non-mutation of inputs, custom-k fallback, tie-breaking by best rank then appearance; extraction forms (`[1]`, `[2,3]`, `[4, 5]`, `[citation: 2, 3]`, dedupe+ascending, code/footnote/markdown-prose rejection, `[0]`/`[-1]`/`[12345]` refusals); strip building (item shape, ascending ids ignoring uncited rows, preview truncation/flattening, legacy un-numbered rows, all hide-null paths, end-to-end fuse→ids→strip). `tools/docCitations.test.js` (4): the tool result the model sees — numbered `[1..k]` passages, exact appended `CITE_INSTRUCTION`, rounded scores, out-of-the-box pairing with `buildSourcesStrip`, and no note on the no-match path. `MessageBubble.test.jsx` (+6 of its 9, stub-free JSDOM renders): strip renders for doc_search answers, grouped/`citation:` forms read correctly, uncited third passage excluded, hidden when nothing cited, hidden without doc results, hidden on user messages, and raw `msg.content` byte-identity. Existing suites stay green: `retrieval.test.js`, `ToolResultCard.test.jsx`, `cardContract.test.js`, `evalHarness.test.js` (the BM25 golden set — ranking rules untouched). ESLint: 0 errors on all touched files (new files warning-free). `vite build` exits 0 (largest chunk 838.9 kB, under the 900 kB budget). Note: `buildGuards.test.js` currently flags two stale allowlist entries (`src/chatSearch.js`, `src/tools/stagehandHealing.js`) from separately-wired modules — neither touched nor reachable-through this change; verified present before/after this diff and left for the owning session.

## Shareable packs: skills + workflows + agents in one `.yogatik-pack.json` file (2026-10-18)

### Marketplace packaging, first step
- **`frontend/src/packShare.js` (new)** — one bundle for the three local collections the panels already manage. `exportPack({ skillIds?, workflowIds?, agentIds? })` picks through the merged registries, strips everything the stores don't own (`builtin`, plugin markers, junk), keeps item **ids** (the importer decides what collides) and refuses empty / >50-item selections. `importPack(pack, { overwrite = false })` re-validates the envelope (`format: 'yogatik-pack'`, `v ≤ 1`, **any key beyond the three collections is refused outright** — a `conversations`/`settings` grab can never ride inside a pack), plans each item as `added / replaced / skipped(+reason)` — collision by id skips by default, `overwrite: true` replaces — then writes only the planned rows through the stores' own upserts, so a failed save degrades to a skipped row instead of aborting the batch. `previewPack` is the same plan with nothing written, `readFilePack` parses + envelope-validates a picked file, `downloadPack` reuses `chatExport.downloadBlob`, malformed items/whole packs throw human messages, and duplicate ids inside one pack collapse to the first copy.
- **`frontend/src/components/PackShareSection.jsx` (new)** — a "Share as a pack" section mounted in `SkillsPanel` (visible on both tabs): three checkbox lists (skills, workflows, agents — agents are loaded + reloaded by the section itself), "**Export selected…**" downloads the checked items as `<date>.yogatik-pack.json`, and "**Import pack**" previews first: a collision-free pack commits right away, anything that would replace or skip opens a review modal with per-item badges (`new` / `replaces existing` / `skipped` + why), an Overwrite toggle that re-plans live, and an `aria-live` result line ("Imported 3 new, 1 replaced, 2 skipped."). Two small hunks in `SkillsPanel.jsx` (import + mount point), `App.jsx` untouched.
- **Tests — `frontend/src/packShare.test.js`, 12 green** (stubbed `./db` with a fake settings map carrying the real `getSetting` null-row fallback semantics, `chatExport.downloadBlob` spied): export shape + field stripping + empty/oversize rejection; whole-pack rejections (wrong `format`, newer version, unknown collection, >50 items in one or split collections); per-item malformed skipping with reasons while valid siblings still import; the collision matrix — preview writes nothing, default import skips and leaves stores untouched, `overwrite` replaces; duplicate-id-in-pack collapsing; export→import round-trip on a cleared store reproduces the originals (`getSkills`/`getWorkflows`/`getAgents` equality, unselected items stay behind); `readFilePack` JSON/format errors; `downloadPack` routed through `chatExport.downloadBlob`.
- **Verification** — `node ./scripts/run-vitest.mjs --run src/packShare.test.js src/buildGuards.test.js`: **16 passed (12 packShare + 4 buildGuards)**; `npx eslint` on the touched files: 0 errors (one pre-existing `importError` unused warning in SkillsPanel); `npx vite build` exit 0, largest chunk 838.9 kB under the 900 kB budget. One buildGuards-only fix rode along: `src/chatSearch.js` and `src/tools/stagehandHealing.js` had become reachable (statically imported by `CommandPalette.jsx` / `browserControl.js` in concurrent work) while still sitting on the dead-file allowlist — the guard's reverse check fails on exactly that, so both stale rows were removed, re-arming the guard rather than widening it.

## TV voice control — the 10-foot UI gets hands-free input (2026-10-18)

### A TV's best input is a microphone, not a D-pad

- **`features.tvVoice` (OFF by default)** — a never-auto-noise toggle in the same spirit as `soundCues`: the app must not open its own microphone on its own. Turned on from the Personalise panel (it renders `TV voice control` automatically), it arms the hands-free path for `[data-device="tv"]` rooms only.
- **`TvVoiceOverlay.jsx` (new)** — a minimal always-available overlay for the couch: a 56px wake control (Enter/Space toggles listening, click works for air-mouse TVs), an `aria-live` status line ("Voice paused — press Enter to listen" → "Listening — say a message" → "Heard: …"), and a standing **mic mute toggle** (a pressed mute cuts the live mic immediately; the next wake press unmutes and listens in one press). Escape closes it (and stops the mic); a re-enabled toggle starts fresh rather than staying closed from an earlier Escape. Never traps focus: nothing autofocuses on mount and Tab moves freely — the TV layer's 4px focus-ring rules light both controls when roved to.
- **Zero new speech code — the Live pipeline, reused** — the mic is `companion/useCompanionVoice`, the same hook FloatingCompanion speaks through and the same live/cascade STT primitives (`speechRecognitionAvailable`, noise gate, echo guard, adaptive endpointing). The overlay only decides WHEN that hook may listen (`enabled: active` = device tv + feature on, force-stopped on any flip) and WHERE a completed utterance lands. Wake-word is left empty so the big button is the wake.
- **Commit goes through the normal path (`App.jsx` `[tv-voice]` hunk)** — one delimited block next to `composer-footer`: `onCommit` trims, sets `input`/`inputRef`, and calls `sendRef.current?.(text)` explicitly (no stale closure), so a spoken message rides the exact same send() route as a typed one — compare mode, queueing, permission checks, prompt history, slash command expansion all just work because the composer did them.
- **CSS (`styles/15-device-adaptive.css`)** — the overlay styles live inside the `[data-device="tv"]` section (latent elsewhere): 168px above the safe-area so the oversized 10-foot composer is never covered, z-index 240 (under modals/toasts), `color-mix` glass panel, pulsing dot while listening, 48px+ targets (56/60px at coarse density), and focus-visible rules repeated at class specificity so no intermediate layer can mute the 4px ring.
- **Tests (23 green across the touched suites)** — `TvVoiceOverlay.test.jsx` (17): the gate (hidden unless `data-device="tv"` AND the toggle is on — set via `document.documentElement.dataset.device` in jsdom), the D-pad flow (Enter toggles with `startListening` asserted through the hook seam, Space too, click works, the mute toggle silences a live mic, Escape closes and stops a live mic, and no focus is stolen on mount), transcript commit reaching `onCommit` (trimming, and blanks commit nothing), the pure `tvVoiceMachine` (wake/sleep/mute/unmute, muted-wake is one press to unmute-and-listen) and `tvStatusText` precedence (error > mute > unavailable > live+interim > paused). The mic hook is module-mocked, so no real audio or SpeechRecognition ever runs; `features.test.js` (+1) pins the OFF default. ESLint clean (0 errors); `vite build` exits 0. Note: `buildGuards.test.js` concurrently flags the separate audit track's untracked `AuditPanel.jsx`/`auditTrail.js` as unreachable — `TvVoiceOverlay` itself passes both the orphan and bundle-reachability guards.

## Live: the camera guard auto-switches to a vision model (2026-10-18)

### Horizon-1's last open item — "text-only model + camera" is now resolved, not just refused

- **Auto-resolution on the same provider (`vision/capability.js:findVisionCandidate`, new)** — pressing the camera on a text-only model no longer stops at the block when the provider also has a vision-capable model. Stored probe verdicts are consulted first (`getCachedVision`, IndexedDB — zero network, so a cache-answered camera press can never stall mid-turn); only where the cache says nothing are 1-pixel `probeVision` calls spent, and only on models whose NAME says vision (`looksVisionCapable`), capped at 4 probes, with an offline shortcut to cache-only. The active (known-blind) model is never probed or picked.
- **The policy is pure (`live/guard.js:resolveCameraAction`, new; `cameraGuard` untouched)** — the decision receives already-resolved verdicts (`[{ model, canSee }]`) plus the preference and returns `proceed | switch | block` in one three-way shape. A negative verdict is not switchable whatever the name says; "no candidate, offline, or failed probes" keeps the guard's teeth with the same one-line why.
- **Switching is mid-call, not a restart (`components/LiveView.jsx`)** — on a positive resolution the live session re-points to the vision model in place (`setModel` on both the gemini realtime and cascade engines, third `true` argument marking it able), App's `onModelChange` re-resolves capability from the freshly written cache, and one transient line goes through the existing status toast — the same channel and auto-clear the session's `setVoice` refusals use: **"Switched to <model> — it can see your camera"**. Unresolved cases still refuse exactly as before (`blindRefusals` unchanged).
- **Consent is a preference (`features.js:liveVisionAutoSwitch`, default ON)** — "Switch to a vision model when the camera turns on", rendered automatically in Personalise. OFF keeps the strict block even when a candidate exists; probing also only ever happens on this explicit camera press, never automatically and never mid-turn.
- **Metric (`live/metrics.js`)** — `recordAutoVisionSwitch`/`getAutoVisionSwitches` + `autoVisionSwitches` surfaced in the live report's both branches (empty and per-sessions) and reset with everything else. Read it beside `blindRefusals`: switches high / refusals low = the trap is closed product-side.
- **Incidental cross-track fix** — `components/PackShareSection.jsx` (another session's untracked, in-flight panel) did not parse (`await` inside a setState updater), blocking `vite build` and buildGuards for everyone; its `changeOverwrite` now previews against the current review row await-then-set, preserving the intent.
- **Tests** — `trust.test.js` (+5 on `resolveCameraAction`: proceed for unknown capability, switch on a resolved verdict, negative verdict not switchable, teeth kept when nothing resolves, toggle OFF preserves the strict block); `capability.test.js` (+7 on `findVisionCandidate`: cache-first with zero network, active model never probed via skip, only name-guesses probed and first confirmed wins, 400 → null + negative cached, probe cap respected, expired TTL re-probed, no candidates → null); `metrics.test.js` (+1 counter behaviour incl. the empty-report branch, +1 wiring describe: `resolveCameraAction` / `findVisionCandidate` / the `liveVisionAutoSwitch` gate / `recordAutoVisionSwitch` in LiveView). `node ./scripts/run-vitest.mjs --run src/live/trust.test.js src/live/metrics.test.js src/buildGuards.test.js` → trust + metrics suites fully green (buildGuards still reports two orphans owned by another in-flight session: `AuditPanel.jsx`/`auditTrail.js`); ESLint 0 errors on all touched files; `npx vite build` exits 0. `App.jsx` untouched.

## MCP marketplace gallery — the curated registry became a browsable connector gallery (2026-10-18)

### Discovery behind a toggle: browse the registry without crowding the power-user list
- **`components/McpMarketplace.jsx` (new)** — a card gallery built ON TOP of `mcpRegistry.js`'s `KNOWN_MCP_SERVERS` (imported, never re-listed — the component even pins in its own test that no preset domain appears in its source, so "two copies, only one wired" can't recur in reverse). Each card shows the preset name, its registry one-liner (what that connector gives the model), the category badge, a transport chip (http/stdio), the **token-needed** flag (`Key` badge) for remote presets, and a derived state chip: **Connected** (configured + enabled), **Needs token** (unconfigured + token-required), **Not configured**, or **Disabled** (added through the old preset row, then switched off). When `refreshMcpTools()` status exists for a card, a **health dot** reports it — green with the connect latency, red with the server's own error string. stdio presets stay hidden in the web build (no `__YOGATIK_MCP_STDIO__` bridge), matching the preset row's rule.
- **Install flow, one click, SAME persistence path** — write the preset into the mcp.js config store (`setMcpServers` — stdio presets in exactly the shape `addLocal()` writes, http ones the shape `add()`) **then** `refreshMcpTools()` (strictly after the write landed — write before connect, verified by mock call order) and notify the host page with `(nextServers, nextStatus)` so the configured list re-renders in step. Switched-off servers re-enable in place (`{...server, enabled: true}`) instead of adding a duplicate — matching by id, else URL, the same rule the old row used.
- **Token-required = a typed user decision, not a click** — an unconfigured token server never takes the write path (no credential = no pretend-install). Its card routes to the **existing** Bearer-token row in `McpServers.jsx` (`onNeedsToken` → pre-fills Name + URL, focuses the token field); the user types the credential there and presses that row's own Add. A configured-but-disabled token server re-enables through the write path instead — re-connecting needs no NEW credential, the same rule `detectMcpNeed()`'s `toEnable` already lives by.
- **Filter tabs (All / Connected / Needs token) + search + honest empty state** — tabs carry live counts (`aria-pressed` state), the search box narrows by name/description/badge, and zero matches render a visible "No connectors match" note whose single button resets both filters.
- **Mount (`components/McpServers.jsx`) — App.jsx untouched** — a "Browse connectors" toggle (`data-testid="browse-connectors"`, `aria-expanded`, collapsed by default) reveals the gallery in place on the MCP dashboard page (`/app/mcp`), so nothing about the configured-list-and-forms layout changes unless the user opens it. No new server definitions anywhere; gallery cards and the old preset row read the same single registry list.
- **Tests (`McpMarketplace.test.jsx`, 15)** — catalog rendered from the real registry (every `KNOWN_MCP_SERVERS` entry present with its desc; stdio presets hidden without the bridge; component-source guard against a second catalog), card state vs enabled servers (connected/disabled/needs-token/not-configured chips + action buttons), health dot carries error text and latency, install click drives `setMcpServers` → `refreshMcpTools` in order with the exact persisted shape (http + stdio), in-place re-enable keeps sibling row identity, token routing leaves the write path untouched (`getMcpServers`/`setMcpServers`/`refreshMcpTools`/`onChanged` all never called), tab + search filtering with reset-from-empty-state, and a mounted-through-the-real-host test proving the gallery is closed behind the toggle and that App.jsx stays out of it. The mcp.js data layer is stubbed throughout (no network, no IndexedDB); the registry stays real.

## Artifacts v2 — the artifact panel becomes a versioned workspace (2026-10-17)

### History, compare, restore, pin — regeneration never erases
- **Version store (`db.js` schema v9, new `artifact_versions` table `++id, artifactKey, createdAt`)** — regenerating an artifact used to simply overwrite the canvas; now the body being replaced is archived first. `saveArtifactVersion` freezes the ±lines badge at save time (reusing `diffPreview.lineDiff`/`summarizeDiff`: `added/removed/lineCount/charCount`), treats an identical re-save as a no-op (reopening an unchanged artifact must not fill the strip with lookalike chips), and caps history at **30 versions per artifact key** — the oldest rows are evicted **keys-only** via `primaryKeys()` (an index-ordered `keys()` returns the *index* values, not the record ids, and would silently delete nothing — the evictions were verified no-op until this fix).
- **History strip (`ArtifactPanel.jsx`)** — a slim chip row under the header: one chip per archived version labelled "Version *n*" with its save time + `+a/-r` line-delta badge, plus a "Live version" chip. Click a chip to **view** the archived body (announced by a "Viewing archived version #n" note banner); **Restore** appends instead of rewinding — the live body is auto-archived first (`auto-saved before restore`), the restored body is written as its own new version (`restored from version #n`), so history is strictly non-destructive and a no-op restore adds nothing. **Compare** renders a side-by-side view (`data-testid="artifact-compare"`, archived pane left / live pane right) built from the data-only `lineDiff` with the panel's own CSS (`.diff-row.add/.del` markers); toggling it off returns to the live preview.
- **Copy / export / pin — one click each** — Copy writes the full body (`navigator.clipboard` with an `execCommand` fallback); **Download file** exports the single artifact (`downloadBlob` in `chatExport.js`, extension + mime chosen per language — `.html`, `.md`, `.py`, …); the **pin** state persists per conversation in the existing `settings` key `artifact_pinned_<conversationId>` (`getArtifactPinned`/`setArtifactPinned`, in-memory fallback for conversation-less contexts), so a pinned artifact survives panel switches and remounts.
- **`App.jsx` untouched** — the panel gained an optional `conversationId` prop only; all versioning logic lives in the component and `db.js`.
- **Tests (42 green across the touched suites)** — `ArtifactPanel.test.jsx` (14): key grouping, archive-on-regeneration with the `+2/-0` chip badge, no cross-key archiving, view + non-destructive restore (rows and note banners asserted through the real Dexie store), no-op restore doesn't duplicate chips, Compare renders `-`/`+` diff rows and toggles off, copy, per-language export, pin persistence; `migration.test.js` (+4 in a new "artifact version store (v9)" describe): the upgraded store exists and is indexed, dedupe + ±lines freezing, 30-version eviction, pin round-trip; `diffPreview.test.js` / `buildGuards.test.js` stay green. ESLint clean on all touched files; `vite build` exits 0.

## Proactive assistant runtime: scheduled workflows finally fire (2026-10-17)

### The scheduler got a pulse (App.jsx [proactive-scheduler] effect)
- **Runtime wiring (`App.jsx`)** — `scheduler.js` (schedule/getDue/markRun), `backgroundWorkers.js` (`drainDueSchedules`, `spawnTask`, `subscribe`) and `workflows.js` (`runWorkflow`) all existed with nobody running them: a schedule was written to `scheduled_tasks_v1` and then sat there forever while the desktop-only `SchedulerPanel` cron bridge never touched the local store. One clearly-delimited `[]`-dep effect in App now makes them fire: first drain **10 s after boot**, then **every 60 s**, plus an immediate catch-up on **`visibilitychange` return** (browsers throttle far-background timers, so coming back to the tab is the reliable beat). Drained schedules spawn through `backgroundWorkers.drainDueSchedules({ runWorkflowById })`, which `markScheduleRun`s (runCount↑, nextDue recomputed, one-offs spent to `Infinity`) and then runs the workflow.
- **Shared execution seam (`runWorkflowCore.js`, new)** — the manual Run path (`App.runWorkflowNow`, SkillsPanel's Workflows tab) was inline UI code. Its step plumbing (send one prompt via `sendRef`, settle-probe `loadingRef` at 900 ms / 300 ms poll / 3 min cap) is extracted to `executeWorkflowAgainstAgent(wf, values, promptRunner)` + `createAgentPromptRunner({ send, isBusy })`, and **both paths now call the same seam** — a scheduled step is an ordinary `send()` turn, so `permissions.js` + `actionBoundary.js` still apply at run time and no prompt code is duplicated. A runner with nowhere to send resolves instead of poll-waiting to the 3-minute timeout.
- **Completion → desktop notification (same effect, `subscribe` path)** — when a `scheduled_workflow` background task completes, App subscribes once to `backgroundWorkers`' listener Set and delivers `window.__YOGATIK_NOTIFY__` (Electron bridge) with `notificationBody`/`notificationTitle` — **only when the user is not looking**, decided by the same `shouldNotifyTurn` policy as the turn notification, so a completion the user is watching never pings. Re-render-safe by construction: plain Set listener + a local seen-ids Set + a mount-time cutoff (finished rows already on disk stay quiet); no state updates, no shell re-renders.
- **Safety contract held** — schedules are created by the user and only by the user: no model-facing or tool-facing path calls `scheduleWorkflow` (verified: no tool registry references the scheduler), the panel states it in the UI, and the run-time permission checks are untouched.
- **Manager UI (`components/ScheduledPanel.jsx`, new — embedded in SkillsPanel's Workflows tab under "Scheduled runs")** — lists every schedule (name, workflow, cadence read from the stored spec, next-due formatted **purely from the stored `nextDue` value**, run count, paused flag), pause/resume via `setScheduledEnabled`, cancel via `cancelScheduledTask` (cancelled rows leave the list), and a create form: pick an existing saved workflow + cadence (once-at-datetime / every-N-minutes / daily time / weekly day+time). `describeCadence`/`fmtNextDue` are exported pure helpers; the panel ships an `aria-live` status line and does not claim to run with the app closed.
- **Tests (32 green across the touched suites)** — `ScheduledPanel.test.jsx` (8): pure cadence/next-due formatting, list render, empty state, pause/resume and cancel asserted against the real `getScheduledTasks` store through a db mock with genuine `getSetting` semantics, create flow landing the user's chosen workflow+cadence in the store, and a once-mode refusal path; `scheduler.test.js` (+5): mocked-db persistence wiring — pause/resume round-trip due filtering, `markScheduleRun` runCount /`nextDue` advance and one-off `Infinity` consumption, cancel semantics; `timeMachineAndWorkers.test.js` (+2): the drain itself — a due one-off drains exactly once, `runWorkflowById` receives `(workflowId, payload{scheduleId})`, a `scheduled_workflow` task spawns and completes with the runner's result, and a spent schedule never refires; `runWorkflowCore.test.js` (5, clock-faked with `vi.useFakeTimers`): `{{last}}` chaining through the injected runner, settle-probe busy/`!busy` timing, timeout give-up, dead-runner bail-out.
- **Note** — these runs happen while Yogatik is open, on its 10s/60s/visibility beats; the desktop app's separate `__YOGATIK_SCHEDULER__` cron bridge is untouched and still serves its own SchedulerPanel.

## Quality-eval runner in Diagnostics — "turn on measurement" made visible (2026-10-17)

### User-facing eval runner (`frontend/src/components/EvalRunsCard.jsx`, wired into `DiagnosticsModal.jsx`)

- **Interactive runner (`EvalRunsCard.jsx`)** — the eval harness previously graded the golden + red-team set silently (`runSafetyScreenEval` on every Diagnostics open); the Diagnostics observability row now has an interactive card beside it: a **"Run quality evals"** button runs all 8 GOLDEN_SET cases on demand and renders pass rate per category (mini-bar per category), failing case rows (failed grader names — `"expect:Paris"`, `"refersResource"` — with an expected-vs-received excerpt and per-case latency), total run duration, and a **Stop** abort control mid-run. Results render in place; nothing scrolls away.
- **Two modes, offline-first by design** — default is the always-available **safety-screen baseline**: pure `assessSafety` grading over GOLDEN_SET, zero network, no model, works with no API key. Full **model mode** (`runEval`) lights up only when a caller supplies `respond` — an async `(prompt) => string` — as a prop; `DiagnosticsModal` accepts and forwards an optional `respond` prop so App's message-send machinery can pass a turn entry through without the card ever importing agent code (App wiring deliberately untouched to avoid conflicts with concurrent App.jsx tracks; the safety baseline covers the no-wire case today). An explicit `mode="full"` without a responder falls back to the offline screen and says so, rather than erroring.
- **Run history persistence** — each finished run appends `{ at, kind, mode, total, passed, byCategory }` to the existing Dexie `settings` key `eval_history` (`getSetting`/`setSetting`, no schema bump), capped at the **last 10 card runs**. The card renders the history as sparkline-ish rows (time, mode chip, pass mini-bar, `passed/total`), newest first. `runAndRecordEval`'s safety+rag snapshots share that key: `appendEvalRun` keeps its own 10-run cap and independently leaves up to 20 harness records in place (mirroring `MAX_EVAL_HISTORY`), so the two writers never evict each other's entries; `pickQualityRuns` ignores records without a numeric `total`, which is why snapshots don't render as card history rows.
- **Abort semantics** — abort discards the run entirely: no result render, no history write (`setSetting` skipped), wrapped responder checks the `AbortSignal` before and after each model call so an in-flight case cancels cooperatively; safety-screen runs are synchronous and effectively instant.
- **Tests** — `EvalRunsCard.test.jsx` (7): full-mode results table rendered from a stubbed `runEval` incl. failed-check/expected-vs-received rows + duration + `eval_history` write shape; safety-only mode proven on the real `runSafetyScreenEval` (spy) with `runEval` never touched and no responder supplied; forced-full-without-responder fallback note; buffered history rows render (incl. coexisting harness snapshot ignored); abort cancelling a stuck full-model run records nothing; pure helpers `appendEvalRun` (dual-cap coexistence) / `pickQualityRuns` / `buildRunEntry` pinned without a db. `DiagnosticsModal.test.jsx` mocks extended (`GOLDEN_SET`/`runEval`, `getSetting`/`setSetting`) since the modal now embeds the card.

## Prefs cross-device sync — field-level LWW (2026-10-16)

### Preferences now follow the account (mobile ↔ TV ↔ desktop)
- **Encrypted prefs doc (`prefsSync.js`, `firebaseAuth.js:savePrefsSnapshot/loadPrefsSnapshot/getPrefsMeta`)** — chat_prefs scalars (temperature, web_search, tools_enabled, persona, auto_route, fallback, locale/voice/engine overrides), the `features.*` toggle map, the theme (`dark`/`light`/`contrast` via `yogatik_theme`), the active project and model prefs (active provider, per-provider model choice, pinned custom-model lists) now sync through the SAME account-derived secret and the same opt-in `chat_prefs.cloud_sync` gate as the conversation corpus, stored in one cheap Firestore doc `users/{uid}/prefs/prefs_v1` (a few KB; vault chunking deliberately unused) — no rules change needed. Excluded by contract: API keys (vault's job), conversations/documents/projects (corpus LWW sync), the `cloud_sync` gate itself (must not follow its own synced data), and per-device noise (`usage_*`, `toolmode_*`, window layout, `models_*` availability caches).
- **Per-field last-write-wins (`stamps`) — not whole-blob** — every synced key carries its own timestamp kept in a Dexie `prefs_sync_ledger` row (`prefsSync.resolveMerge`); a key is re-stamped only when ITS value changed since the last push, so a phone theme change cannot clobber a newer desktop `tools_enabled` edit — both land. Equal stamps keep local (the conversation-sync tie rule); an un-synced local edit beats any pull and is re-stamped on the following push, so pulls never revert live work. First sync converges both devices' untouched defaults.
- **Wiring (`api.js:syncCloudData`, `SyncTab.jsx`)** — prefs pull→push runs after the conversation pull+push inside the same gate with try/catch (a prefs failure never fails the chat sync, and never blocks sign-in); Settings → "Sync Now" now also carries prefs/flags via `pullPrefs({ force: true })`/`pushPrefs({ force: true })` (manual sync bypasses the auto-opt-in, signed-in still required). The Encrypted Sync toggle previously wrote `chat_prefs.cloudSync` while `cloudSyncEnabled()` reads `chat_prefs.cloud_sync` — the gate never saw the opt-in — `updatePref` now persists both spellings (camelCase stays the UI mirror).
- **Live application (`App.jsx:registerPrefsApplier`, `prefsSync.autoApply`)** — remote prefs are written straight into Dexie settings/localStorage, then a registered applier notifies the running UI (theme, temperature, web_search, tools, auto_route, fallback, persona, `features.*`, active provider, active project + conversation reload) through a render-refreshed ref so no stale closures; prefsSync never imports React.
- **Tests** — `prefsSync.test.js` (12): collects the right fields while excluding keys/secrets/noise, encrypted push round-trip with a stubbed Firestore doc, field-level LWW (recent theme on mobile + recent auto_route on desktop both land and stamps converge), tie/clockless merge rules, autoApply store-then-notify ordering, opt-in gate + signed-out no-ops, malformed ciphertext rejection; `cloudSync.test.js` gains the `syncCloudData` prefs wiring pin (gate on/off, no api keys in the snapshot). 32 tests green across `prefsSync/cloudSync/crypto`.

## Device-class responsive + adaptive UI: mobile / TV / laptop / desktop (2026-10-16)

### Adaptive shell (`frontend/src/deviceClass.js`)
- **Device classification** — new module classifies the window into `tv | mobile | tablet | laptop | desktop` and writes `data-device` onto `<html>`, plus `data-density` (`touch | coarse | normal`) describing the pointer. TV wins two ways: UA tokens (SmartTV / Tizen / webOS / AndroidTV + synonyms), or `min(100vw,100vh) ≥ 1600px` **and** a coarse pointer. Brackets: ≤820 → mobile (or coarse pointer), 821–1279 tablet, 1280–1919 laptop, ≥1920 desktop; a zero×zero measurement refuses to guess small and defaults desktop.
- **Safe-area injection** — `env(safe-area-inset-*)` cannot be read from JS, so a hidden probe element reads them from computed style and publishes `--sat/--sab/--sal/--sar` on `<html>`, filling ONLY the missing vars (stylesheets keep authority). Every CSS consumer falls back to `env()` directly, so a no-JS first paint still respects the notch.
- **Viewport-meta repair** — `getViewportMetaFix()` merges the canonical content (`width=device-width, initial-scale=1.0, viewport-fit=cover, interactive-widget=resizes-content`) into the existing `<meta name="viewport">`, preserving unknown keys and **stripping `maximum-scale`/`user-scalable=no`**: zoom stays in the user's hands (WCAG 1.4.4), which also kills the iOS input-focus zoom jitter honestly instead of forbidding zoom. `initDeviceClass()` wires all three plus a 150 ms-debounced re-evaluation on `resize` + `orientationchange`; it returns `dispose()` (called from App.jsx's mount effect) so StrictMode/HMR remounts cannot stack listeners. Pure core (`classifyDevice`, `isTvUserAgent`, `densityFor`, `getViewportMetaFix`) is DOM-free and test-pinned.
- **Wire-up** — `App.jsx` mounts it once in its own effect next to the theme-attribute effect; reachability guard stays green (module imported from `App`).

### Adaptive CSS (`frontend/src/styles/15-device-adaptive.css`, imported LAST in styles.css after 14-high-contrast)
- **`[data-device="tv"]`: 10-foot design** — root font 18px (rem-based rules scale with it), 4px `:focus-visible` outline, spotlight nav via `:focus-visible` on a `:where()` list (hover can never be the only signal; hover affordances mirrored onto focus, e.g. tool cards, icon buttons), smooth-scroll scroll regions + 14px scrollbars, and an oversized 24px composer (one deliberate `!important` to outrank mobile-optimizations.css's 16px input rule).
- **`[data-density="touch"]`** — 44×44 minimum targets on a `:where()` control list (button/role=button/inputs/select + the app's own classes), roomier paddings, and bottom-sheet modals under `@media (max-width: 820px)` (`align-items: flex-end`, full-width sheet, drag-handle pseudo-element, safe-area bottom padding, `prefers-reduced-motion` disables the slide).
- **`[data-device="laptop"], [data-device="desktop"]`** — tightened 13–14px chrome var scale, 14px bubbles with denser assistant line-height, disciplined reading columns (760px lap / 860px desk), focus ring stays keyboard-only (`:focus-visible`, hover safe on fine pointer), sidebar docked (`position: relative`, explicit `.collapsed` collapse preserved so user choice still works).
- **Fluid typography** — `clamp()` scale vars (`--fl-display/--fl-h1/--fl-h2/--fl-bubble/--fl-ui`) on headers, modal headings, bubbles and sidebar chrome, so text interpolates between breakpoints instead of jumping.
- **Container queries** — behind `@supports`, `.messages` is a named `chat` container: bubble geometry reacts to the PANEL's width (docked workspaces get phone-tight bubbles at any window size, wide columns get room).

### Tests
- **`deviceClass.test.js`** — 33 tests: breakpoint brackets (820/1279/1919/1920 boundaries both sides), real TV UA strings for Tizen/webOS/AndroidTV/BRAVIA/Fire-TV model codes/GoogleTV/AppleTV + negative desktop/iPhone/Android-phone/AdSense-bot cases, coarse-pointer rules (1920×1080 touchscreen → mobile, size+coarse → TV), density mapping, viewport-meta merge (zoom-stripping, unknown-key preservation, canonical tie-break), safe-area var injection/authority, attribute writes, debounced resize/orientationchange re-evaluation + dispose hygiene. Full `run-vitest` for `deviceClass.test.js` + `buildGuards.test.js`: **37 passed**; `eslint` on touched files: **0 errors**; `vite build`: clean, largest chunk 838.9 kB under the 900 kB budget; adaptive layer verified present in the emitted `index-*.css`.

## Design system foundations + precision polish pass (2026-10-16)

### Token layer (`frontend/src/styles/16-design-tokens.css` — imported LAST in styles.css, CSS-only, no JSX touched)
- **Discipline** — only NEW custom-property names are declared; the base palette in `00-sidebar.css` / `[data-theme="light"]` / `[data-theme="contrast"]` is never redeclared, so neither theme can be shadowed by a later `:root` equal-specificity win. Semantic aliases are `var()` chains (`--surface-*` → `--bg*`, `--border-subtle/strong` → `--border-color/--border`, `--fg*` → `--text-*`) that resolve per element and therefore track dark, light **and** the audited high-contrast theme automatically.
- **Type scale** — `--font-xs…3xl` via `clamp()` (11→12 / 12→13 / 13→14 / 15→16 / 17→19 / 20→24 / 24→32 px), rem-based so OS/browser font scaling still applies; slopes tuned so 1280–1440 laptops sit at nominal size. Applied to `.message` (≥769px desktops only — phones keep their 15px touch rules from mobile-optimizations.css), panel headers and dash headings.
- **Spacing · radii · elevation** — `--space-1…8` (4px base, `--space-8: 32px` aligned with design-system/global.css), `--radius-sm/md/lg/xl/pill` (6/8/12/16), theme-aware `--shadow-1…3` + `--shadow-sm/md/lg/xl` aliases — which **fixes a latent bug**: `.toast`'s `var(--shadow-lg)` in mobile-optimizations.css was never defined anywhere and silently no-op'd.
- **Motion tokens** — `--dur-fast/normal/slow` (150/240/420ms), `--ease-out-quint` curve matching the app's existing settle palette; `prefers-reduced-motion` collapses the tokens to `0.01ms`/`0s` app-wide and stills the shimmer/skeleton animations.
- **Focus ring token** — `--focus-ring-width/offset/color` (3px · accent · 2px offset), applied via `:root :focus-visible` (0,2,0 — visible on keyboard focus only). The high-contrast theme's `!important` yellow ring still wins where it can, `[data-theme="contrast"]` pins `--focus-ring-color: #ffff00` literally, `forced-colors` falls through to `Highlight`, the `.dash-nav-item` inset ring (`outline-offset: -2px`) is re-asserted, and 15-device-adaptive's TV 4px/4px ring is mirrored on the same token colour so neither layer can pixel-tie it away.
- **Density/device hooks** — real attribute values honoured (`data-device="tv|mobile|tablet|laptop|desktop"`, `data-density="touch|coarse|normal"`): control-height triad `--control-h-sm/md/lg` steps 40/44/48 on touch (mobile/tablet + `data-density="touch"`), 36/44/48 on TV/coarse, default 32/36/44; standard `(hover:none) and (pointer:fine)` media fallbacks replicate the same before the attributes exist.
- **Scrollbar tokens** — `--scrollbar-size: 8px` thin, theme-aware `--scrollbar-thumb(-hover)` via `color-mix`, unified across the nine main scroll regions (messages, sidebar, settings, tool picker, modals, palette, model list, dash, terms) with a 2px transparent lane so the track reads hairline; on touch (`hover:none` + coarse pointer, or mobile/tablet attributes) native bars hide for an overlay feel while momentum scrolling stays.
- **Skeleton shimmer** — `--skeleton-base/-highlight/-shimmer/-speed/-radius` + reusable `.skeleton`/`.yg-skeleton`; the existing `.ws-skeleton` gradient is retokenized in place.

### Precision polish (same file, additive — cascade wins ties by import order)
- **8px rhythm** — stray 6/10/14px offsets retired with targeted overrides (tool cards now gap-driven at 8px via `.tool-results` flex, message bottom actions/attached-file/composer footer/local panel → 8px, sidebar 14→16, `yg-panel` chrome 14/18→16/20, dash topbar 15→16, mobile composer gutters 12→16).
- **Reading measure** — bubble `max-width: 72ch` on pointer devices (`min-width: 769px`), `100%` on touch; the laptop/desktop classes of 15-device-adaptive are attribute-escalated to the same 72ch so both layers agree; `overflow-wrap: break-word` keeps long tokens inside the measure.
- **Icon buttons** — `line-height: 0` + block-level `svg` for exact 1px stroke centering across `.icon-btn`, `.bottom-action-btn`, `.sidebar-action-icon-btn`, `.yg-panel-icon-btn`, `.composer-icon-action-btn`; hovers speak through color/background tokens (`.bottom-action-btn` rgba hover → `--surface-3`/`--border-subtle`/`--fg`; the stop button's opacity hover became a color-token darken).
- **Buttons** — unified `--control-h-sm/md/lg` heights (32/36/44 default density triad) and consistent `--btn-pad-sm/md/lg` (8/12/16) horizontal padding on the main button families; `--dur-fast` token transitions limited to color/background/border/box-shadow/transform so `transition: all` layouts stop thrashing; drawer/panel growth rides `--dur-normal` on transform/opacity only.
- **High-contrast verified** — no `!important` introduced on ring/scrollbar colors, so the audited 13–21:1 theme keeps winning its own rules; contrast gets dedicated thumb/skeleton token values.

### Verification
- `node ./scripts/run-vitest.mjs --run src/buildGuards.test.js src/deviceClass.test.js`: **37 passed** (first run tripped mid-flight while the device-class sibling session was still saving `prefsSync.js`/`deviceClass.test.js`; settled tree is green).
- `npx vite build`: **exit 0**; all token blocks verified present in the emitted `index-*.css` (motion, clamp scale, spacing/radii/shadows, density hooks, alias chains, 72ch rules, scrollbar geometry, shimmer, focus twins). eslint: n/a (CSS-only pass, no JSX touched).

## Sprint 2 - Performance & Trust: workers, consent, eviction safety (2026-10-15)

### Heavy tools off main thread & out of first paint
- **Worker-first Pyodide (`tools/codeExec.js`, `workers/pyodideWorkerClient.js`)** — `code_execute` runs in `/worker-pyodide.js` (postMessage, stateful kernel); main-thread load survives only as a Worker-less fallback, so Python never janks the composer.
- **Dedicated heavy worker (`public/worker-heavy.js`, `workers/heavyToolsWorkerClient.js`)** — lazy shared worker, id-multiplexed postMessage, transferable buffers, stateful Tesseract engine. Raw OCR takes the worker fast-path behind the same confidence honesty gate.
- **Dynamic imports (`tools/ocr.js`, `tools/videoRender.js`, `tools/heavyLazy.js`, `tools/index.js`)** — vision pipeline, video draw/encode/speech and torrent engine load on first use. New `code-exec`, `ocr-tools`, `video/video-pipeline`, `heavy-workers` vite chunks; `heavyTools.test.js` pins the bundle gate.

### Blocking size-labelled download consent
- **Per-feature sizes (`downloadConsent.js`)** — detection ~40MB, embeddings ~23MB (up to ~230MB), WebLLM ~350MB, Kokoro ~90MB, Whisper ~145MB, local VLM ~230MB. Blocking (`blocking: true`), size-labelled prompts remembered per feature and mirrored into `features.*` toggles. Extended `enhancements.test.js`.

### Eviction safety + richer export
- **Settings warning & nudge (`storage.js:getEvictionSafety`, `components/BackupNudge.jsx`)** — best-effort warning + one-click `persist()` in Data Hub, weekly-at-most JSON backup nudge after 5+ conversations.
- **One-click JSON/PDF toolbar (`chatExport.js`, `components/ChatExportToolbar.jsx`)** — lossless JSON round-trip reusing `textOf` normalisation, next to MD/PDF actions.

## Sprint 3 — Reach & Insight: WCAG 2.1 AA + privacy-first analytics (2026-10-15)

### Accessibility (WCAG 2.1 AA)
- **Streaming announcements**: `StreamingMessage` keeps token text out of live regions (`aria-busy` + `role="article"` label flips responding→complete); completion announced exactly once via the global polite announcer (`A11yAnnouncer`, `role="status"`) + new `ref.complete()`. Errors stay assertive. Manual axe checklist documented in code comments.
- **Picker & panels**: `ModelPicker` trigger is a real button (`aria-haspopup/expanded/controls`), keyboard opens with Enter/Space/ArrowDown, Escape returns focus, filter uses `aria-activedescendant`; `ReasoningAccordion` header converted from `div[role=button]` to native `<button aria-expanded/controls>` + content `role="region"`; `ToolStatusPanel` retry/fix/dismiss all carry accessible names.
- **High-contrast theme**: new audited `14-high-contrast.css` (`data-theme="contrast"`, 17–21:1 text ratios, 3px focus ring, forced-colors + reduced-motion support), selectable in Settings → Appearance.
- **Shortcut map**: `SHORTCUT_MAP` exported from `ShortcutsModal.jsx` (single source of truth), `?` toggles the map outside text fields (Ctrl+/ always works), modal autofocuses Close + Escape-to-close.

### Privacy-first analytics (opt-in, default OFF)
- **Consent gate**: new `analyticsConsent.js` (localStorage consent, lazy dynamic import of `analyticsSink.js` only after opt-in, revoke drops sink); transparent `AnalyticsToggle` in Settings → Privacy & Sync (host + project key, exact data disclosure).
- **Anonymised events**: existing `toolStatus`/`telemetry` hook points unchanged; `live/metrics.js` `endSession` now forwards a content-free `live_session` funnel event (tool, ok, errorType, bucketed latency, turn count) — no-op unless opted in.
- **Tests**: `analyticsConsent.test.js` (gate default OFF, revoke, event-shape allowlist, bucket coarseness, fail-open silence) + `reachInsight.test.jsx` (shortcut map, completion-only announcements, native-button accordion, picker listbox semantics). 86 + 115 related tests green; eslint 0 errors.

## Sprint 4 — Cross-device LWW sync, project memory & Live trust (2026-10-15)

### Sync (LWW first)
- Last-write-wins conversation/document metadata sync via the encrypted Firestore snapshot behind Firebase Auth (opt-in `chat_prefs.cloud_sync`, AES-GCM in transit/at rest). Newer `updatedAt` wins, ties keep local, messages union on re-import, documents de-duped by content hash. New conversations/documents mint a stable `syncId` for cross-device identity (old rows fall back to content signatures). CRDT / op-log convergence is an explicit follow-up, noted in `syncMerge.js`.
- Extended `cloudSync.test.js` + `syncMerge.test.js` (LWW winner/tie/union, syncId minting, hash dedupe).

### Memory / projects foundation
- Minimal project-scoped memory (`memory.js` + `memory.test.js`): save/recall/forget/clear over the existing Dexie `memories` table (no schema change); recalls never leak across projects.
- Per-project settings scope (`chatScope.js`): `get/set/clearProjectScoped` + `getChatInProject` (chat → project → global); `PROJECT_SCOPED_KEYS` named once.
- Project filter for loaded lists (`convGroups.js`): `scopeEntriesToProject` companion to `db.getConversations(projectId)`.

### Live trust (Horizon 1)
- Blind-model camera block (`live/guard.js`, `LiveView.jsx`): refused with a one-line why, refusals metered (`blindRefusals`) and surfaced in Diagnostics.
- Honest dark-frame refusal (`live/visionGuard.js`): block-severity frames short-circuit `cascade.describeIfVisual` and the vision panel before any model call, reusing the `readable.js` first-caveat.
- Whisper fallback metering (`live/metrics.js`, `cascade.js`, `DiagnosticsModal.jsx`): on-device Whisper stays the fallback, not the default, per roadmap sequencing — every cloud-STT failure and handover is now counted and shown in Diagnostics beside the live latency card.

## Sprint 1 — Security hardening (2026-10-15)

### 🔒 CSP + sanitisation
- **Unified DOMPurify choke point (`sanitize.js`)** — new `sanitize()` / `sanitise()` helper routes every LLM/tool HTML string through one path (SVG input via the DOMPurify SVG profile, everything else via the strict HTML profile); `sanitizeSvg` reimplemented on DOMPurify instead of hand-rolled DOMParser stripping.
- **Meta/header CSP sync (`index.html`, `firebase.json`)** — `<meta>` policy now matches the enforced hosting header (`'unsafe-inline'` restored so the page's own inline service-worker snippet is not self-blocked); stale "Report-Only" comment corrected. `cspGuard.test.js` pins the two in sync.

### 🛡️ Proxy hardening
- **`cors-proxy/worker.js`** — vetted provider-host allowlist enforced (403 otherwise), `Authorization`/`x-api-key` forwarded only to credential-allowlisted hosts (e.g. `api.github.com` proxies reads but never receives keys), per-origin 60 req/min rate limit, per-target logging. Named exports added for tests; `corsPolicy.test.js` now covers the worker (403, credential stripping, 429 + logging).

### 🔑 Key-model resolution
- **One model confirmed** — account-derived AES-GCM (`yogatik.account.v1.<uid>`, Firestore rules scope to owner) with `KEY_STORAGE_DISCLOSURE` rendered next to key entry (`ProviderModal.jsx`, `ProvidersTab.jsx`): "encrypted at rest, scoped to your account — not zero-knowledge". `crypto.test.js` pins the shipped path (round-trip via account secret, cross-uid rejection, disclosure wording).

## v12.1.1 - Electron Main Process CommonJS Migration & Packaging Compatibility (2026-10-02)

### 🖥️ Desktop Platform & Main Process Stability
- **Electron Main Process CommonJS Migration (`browserConfig.cjs`, `browserControl.cjs`)** — Migrated `browserConfig` to an explicit `.cjs` format and updated imports across the main process. This permanently fixes the startup error `ReferenceError: module is not defined in ES module scope` caused by the root package declaration `"type": "module"` in packaged Electron releases.
- **Dual ESM / CJS Compatibility Bridge (`browserConfig.js`)** — Implemented an ESM wrapper that delegates to the CommonJS configuration, ensuring clean module resolution across both Vite web application tooling and Electron desktop binaries.
- **Yogatik Browser Standalone Alignment (`yogatik-browser/electron`)** — Synchronized configuration modules in the standalone browser edition with full CJS/ESM dual compatibility.

## v12.1.0 - Autonomous Relentless Loop, On-Device WebLLM Auto-Load, Staging Diffs & Multi-Action Checkpoints (2026-10-02)

### 🤖 Autonomous Relentless Loop & Checkpoint Persistence
- **Autonomous Relentless Loop (`relentlessLoop.js`, `agent.js`)** — Multi-step mission loop that automatically tracks execution progress, detects stagnation or loop traps, diagnoses failure root causes, and issues structured momentum directives.
- **Interactive Staging Diff Review Card (`DiffReviewCard.jsx`, `diffPreview.js`)** — Visual code diff preview showing additions, deletions, and line modifications with direct Accept & Apply or Reject actions.
- **Persistent Mission Checkpoints (`taskPlanMemory.js`, `App.jsx`, `MessageBubble.jsx`)** — Automatic per-task plan persistence to IndexedDB allowing one-click resume from any arbitrary action step across page reloads.

### 🧠 On-Device Model Loading & Zero-Key Autoload
- **Verified WebLLM Pipeline & Resilient Auto-Reload (`localLLM.js`)** — Rebuilt WebLLM engine initialization to verify pipeline readiness before completion requests, auto-reloading model weights into WebGPU if unloaded or uninitialized and eliminating `Model not loaded before trying to complete ChatCompletionRequest`.
- **Zero-Key Autoload when Providers Unavailable (`App.jsx`)** — Automatically initializes and preloads the on-device AI model into WebGPU when other providers have no configured API keys or when the on-device provider is active.
- **1-Click Model Load & Live Progress Indicators (`App.jsx`, `MessageBubble.jsx`, `02-sidebar-polish.css`)** — Added a dedicated "Load Model" / "GPU Ready" badge in the model picker bar, a real-time progress banner directly above the composer input, and a "Load Model to GPU" recovery button on execution error cards.

## v12.0.0 - Standalone Dedicated Tool Windows, Resilient Ollama Model Discovery & Multi-Window Production Suite (2026-10-01)

### 🪟 Standalone Dedicated Tool Windows
- **Independent Multi-Window Architecture (`toolWindows.cjs`, `MediaStudioStandaloneView.jsx`, `TradingStandaloneView.jsx`, `TorrentStandaloneView.jsx`, `DomainHubStandaloneView.jsx`)** — Media Studio, Trading & Algo Terminal, BitTorrent Manager, and Domain Hub now launch as independent Electron browser windows with their own state, hotkeys, and multi-monitor support.
- **Multi-Window IPC Entitlement (`entitlementCore.cjs`, `preload.cjs`)** — Hardened capability isolation across secondary renderer processes, registering dedicated standalone channels under strict security bounds.

### 🦙 Ollama & Local Model Discovery
- **Provider Shadowing & Dynamic Discovery Fix (`llm.js`, `api.js`, `ollama.js`)** — Fixed provider definition merging so local Ollama instances dynamically probe, query, and populate installed models without default configuration clobbering.
- **Active Connection Probing & Readiness Broadcast (`ProviderModal.jsx`, `ollama.js`)** — Testing provider connections immediately probes live models and dispatches `yogatik:ollama-ready` events on boot.

### ⚡ Build & Codebase Health
- **Electron TypeScript & Playwright Compilation Fix (`tsconfig.main.json`, `browserBridge.ts`)** — Standardized TypeScript compiler resolution and typed Playwright interfaces, enabling clean `npm run build:main` compilation.
- **Comprehensive Test Suite Pass** — 292 test suites with 2,945 tests all passing without regressions.

## v11.6.0 - Adaptive Tool Calling, In-Place Prompt Rewind & Precision Code Editing Suite (2026-10-01)

### 💬 Conversation UX & Prompt Rewind
- **In-Place Prompt Rewind & Edit (`App.jsx`, `MessageBubble.jsx`)** — Clicking edit on any earlier message now truncates subsequent turns directly in-place in the current chat session and storage, preserving working folder grants, model choices, and conversation ID without branching clutter.

### ⚡ Autonomous Execution & Tool Calling Reliability
- **Adaptive Tool Schema Limits (`agent.js`, `tools/index.js`)** — Open-weight and local models (Groq, NVIDIA NIM, Ollama, Cerebras, Together) now receive an optimized 36-tool schema limit rather than overwhelming 96-tool dumps (~25KB), eliminating function-calling confusion, drastically improving tool call success rate, and ensuring all core execution tools (`fs_*`, `terminal_run`, `web_search`, `deep_research`) are permanently available.
- **Immediate Error Self-Correction Loop (`agent.js`, `toolReflection.js`)** — Injected actionable reflection hints directly into the turn on the very first tool failure, allowing the model to auto-correct file paths, inspect lines with `fs_read`, or heal syntax errors in a single step.

### 🛠️ Precision Code Development & Workspace Awareness
- **Precision Code Editing Standard (`agent.js`, `tools/index.js`)** — Upgraded Yogatik AI's core instructions to enforce `fs_edit` (search & replace) and `fs_patch` (unified diffs) over full-file overwrites (`fs_write`), preventing code truncation and hallucinations. Elevating `fs_patch` into core prioritized tools.
- **Active Workspace Directory Awareness (`agent.js`, `tools/localFs.js`)** — In desktop mode, Yogatik AI automatically detects and injects the active workspace root directory path into the system prompt, eliminating hallucinated file paths and path-guessing.
- **Multi-Round Context Compaction (`agent.js`)** — Automatically compacts older tool outputs (> 4 tool messages back) in multi-round turns to keep reasoning context crisp and maintain low latency.

### 🌐 Cross-Platform Synchronisation
- **Synchronized v11.6.0** — Aligned version numbers and release manifests across Web, Desktop (Windows, macOS, Linux), and Standalone Browser pages.

## v11.5.0 - Flagship Yogatik AI, Zero-Stall Tool Execution & Code Engineering Suite (2026-09-30)

### ⚡ Flagship Yogatik AI & Autonomous Engineering
- **Native Flagship Yogatik AI (`agents.js`, `api.js`)** — Introduced Yogatik AI as an autonomous, self-reliant intelligence with permanent priority access to the filesystem, terminal, live web search, and multi-agent delegation.
- **Zero-Laziness Code Implementation Protocol (`agents.js`)** — Prohibited conversational placeholders, hand-wavy snippets, or unfinished stub functions. When code modifications are requested, Yogatik AI actively reads the file via `fs_read` and writes complete, working implementations via `fs_write` or `fs_edit`.
- **Flagship Tool Suite Priority Boost (`tools/index.js`)** — Ensured core engineering tools (`fs_*`, `terminal_run`, `code_execute`, `web_search`, `spawn_agents`) maintain first-tier positioning in system prompts and declarations across every turn.

### 🛠️ Agent Tool Calling & Stream Reliability
- **Zero-Stall Reasoning & Tool Unsticking (`agent.js`)** — Eliminated reasoning model tool dropouts in the desktop app where deep thinking models (<think> blocks) stalled in internal monologues by actively intercepting deliberate action intents and auto-seeding tool actions for `fs_list` and `fs_write`.
- **Full Code Writing & Refactoring Priority (`tools/index.js`)** — Guaranteed file write, edit, and diff tools remain active during code reviews, audits, and workspace refactoring rather than being pruned into read-only mode.
- **Tool Results Synthesis Findings Card (`agent.js`, `MessageBubble.jsx`)** — Ensured executed actions are always synthesized into rich markdown findings cards with concrete file paths, diff statistics, and next steps, preventing blank bubbles.
- **Localhost CORS & Cloudflare Proxy Guard (`llm.js`)** — Stopped 403 cloud proxy errors for local Ollama instances on web origins and quieted live model warnings.

### 🌐 Cross-Platform Synchronisation
- **Synchronized v11.5.0** — Aligned version numbers and release manifests across Web, Desktop (Windows, macOS, Linux), and Standalone Browser pages.

## v11.4.0 - AI Modal & Prompted-Mode Response Healing, Shell Stability & Cross-Platform Release (2026-09-30)

### 🤖 AI Model Execution & Streaming
- **Prompted-Mode Response & Token Healing (`agent.js`)** — Resolved critical reply duplication in prompted mode where responses were doubled in message bubbles and raw tool call JSON leaked to users during unbuffered streaming. Restored proper tool syntax buffering and live `<think>` reasoning token streaming.
- **Degenerate Stub Suppression (`reasoning.js`)** — Filtered bare degenerate stub outputs (`null`, `undefined`, `none`, `false`, `true`) emitted by stalled models to force continued synthesis instead of blank or broken bubbles.
- **Checkpoint Error Resumption (`agent.js`, `checkpointResume.test.js`)** — Fixed error handling so mid-flight terminal errors properly trigger `onError` callbacks and attach complete state checkpoints for recovery.

### 🪟 App Shell & AI Modal Stability
- **Modal State Reference Fix (`App.jsx`)** — Fixed `ReferenceError: showPersonalise is not defined` by aligning `webDockOccluded` with `browserOccluded` to prevent app crash on initial render.
- **Streaming Message Engine (`StreamingMessage.jsx`)** — Restored synchronous imperative ref handle methods, activeAction stepped progress tree, and clean null-state guards for zero-latency 60fps streaming.
- **Entitlement & IPC Security Matrix (`entitlementCore.cjs`)** — Added Git worktree channels (`git_worktree_*`) and user config persistence (`yogatik:loadConfig`, `yogatik:saveConfig`) into the core capability matrix.

### 🌐 Cross-Platform Synchronisation
- **Synchronized v11.4.0** — Aligned version numbers and release manifests across Web, Desktop (Windows, macOS, Linux), and Standalone Browser pages.

## v11.3.0 - Real-Time Reasoning Streaming & Robust Model Watchdog (2026-09-29)

### 🧠 Reasoning & Streaming Engine
- **Real-Time Reasoning UI Streaming (`agent.js`)** — Streamed tokens in both prompted and native modes now immediately push to `onToken` and `fullContent`, ensuring thinking steps and model answers appear live in the UI without getting suppressed or leaving blank bubbles.
- **Strict Tool Call Discrimination (`agent.js`)** — Refined tool invocation detection so regular markdown JSON and code blocks output by models (e.g., Nemotron, Qwen, DeepSeek) are treated as prose content and rendered directly into the chat bubble rather than misidentified as tool calls.
- **Watchdog Pre-Synthesis Guard (`agent.js`)** — Positioned visible answer and plan synthesis prior to response quality watchdog evaluations, preventing pure reasoning turns or action plans from triggering false empty-response retries or `_[stopped]_` dropouts.
- **Anti-Stall Reasoning Protection (`reasoning.js`)** — Adjusted loop suppression threshold to require 25+ consecutive dots and 4x identical repeats, protecting complex reasoning steps and technical tables from premature stream termination.

### 🌐 Cross-Platform Synchronisation
- **Synchronized v11.3.0** — Aligned version numbers and release manifests across Web, Desktop (Windows, macOS, Linux), and Standalone Browser pages.

## v11.2.0 - Overloaded Model Auto-Recovery & Autonomous Watchdog Continuation (2026-09-29)

### ⚡ Resilience & Auto-Recovery
- **Overloaded Model Reconnection (`agent.js`, `App.jsx`)** — Implemented autonomous auto-retry and reconnection loop for transient provider errors (`429`, `503`, `The model API is currently overloaded`) with exponential backoff and transparent live status updates (`⚠️ Model API overloaded/unavailable — reconnecting in Xs...`).
- **Autonomous Watchdog Continuation (`App.jsx`, `responseWatchdog.js`)** — Connected response quality watchdog verdict `continue` directly to execution pass using `continuationPrompt` so incomplete or truncated outputs (unclosed code fences, mid-sentence cuts, token limit boundaries) are automatically resumed instead of accepted partially.
- **Seamless Stream Healing** — Enabled auto-recovery to execute even when partial tokens had already been received prior to the stream interruption.

### 🌐 Cross-Platform Synchronisation
- **Synchronized v11.2.0** — Aligned version numbers and release manifests across Web, Desktop (Windows, macOS, Linux), and Standalone Browser pages.

## v11.1.0 - Live Speech On-Device Whisper Fallback & Vision Modal JSON Formatter (2026-09-28)

### 🎙️ Live Mode Speech Recognition & Electron Reliability
- **Electron Cloud Web Speech Bypass (`cascade.js`)** — Detects Electron runtime environment to bypass the cloud Web Speech API (`SpeechRecognition`), which throws repeated network errors without Google API credentials, and directly initializes on-device Whisper transcription.
- **Immediate Speech Recognition** — Eliminates the 2-retry loop delay and reconnecting banners when speaking in desktop Live mode.

### 👁️ Vision & Multimodal Inspection
- **Interactive JSON Tree Viewer (`VisionModal.jsx`, `12-vision-modal-json.css`)** — Added collapsible JSON tree viewer with level expansion, syntax highlighting, and Raw/Formatted mode toggle for structured vision outputs.
- **Natural Language Vision Prompts (`LiveView.jsx`)** — Enhanced live camera frame prompts to request natural conversational language from multimodal vision models rather than raw JSON structures.

### 🌐 Cross-Platform Synchronisation
- **Synchronized v11.1.0** — Aligned version badges across Web, Desktop (Windows, macOS, Linux), and Standalone Browser pages.

## v11.0.0 - Modal Streaming Fixes, Session Replay, Cost Tracking & Plugin System (2026-09-28)


### 🤖 Multi-Agent Orchestration & Sub-Agent Delegation
- **Mandatory Multi-Agent Delegation Directive (`agent.js`)** — Replaced passive delegation suggestions with a concrete directive commanding models to autonomously decompose multi-part objectives (research + code, multi-topic comparisons, full-stack implementations) and dispatch specialized sub-agents (`researcher`, `coder`, `analyst`, `writer`, `planner`) via `spawn_agents` or `crew_orchestrator` in parallel.
- **General Assistant Active Delegation Persona (`agents.js`)** — Upgraded the default General Assistant persona to proactively partition complex, multi-faceted queries across specialist sub-agents concurrently, synthesizing their unified findings into an executive final output.
- **Dynamic Multi-Intent & Workflow Tool Prioritization (`tools/index.js`)** — Enhanced `prioritizeToolSchemas` to score `spawn_agents` (240) and `crew_orchestrator` (220) to top tier when multi-step intent keywords (`in parallel`, `concurrently`, `break down`, `multi-part`, `end-to-end`) or multi-intent connectors (`and also`, `research and`, `analyze and`, `build and`) are present in user queries.

## v10.9.6 - Live AI Reasoning Visibility, Stream Transparency & Icon Persistence (2026-09-26)

### 🧠 AI Thinking & Real-Time Reasoning
- **Prompted Mode Live Reasoning (`agent.js`)** — In prompted tool execution mode, `<think>`, `<thought>`, and `<reasoning>` tokens now stream live into the chat bubble's Reasoning accordion and the Thinking & Actions side panel as they arrive from the model. Previously, prompted mode buffered all stream tokens until completion to detect tool call syntax, which suppressed visible thinking tokens for reasoning models like NVIDIA Nemotron-3 Ultra, DeepSeek-R1, and Qwen-QwQ.
- **Immediate Thinking Forwarding** — The token buffer selectively forwards thought chunks to `onChunk({ reasoning: token })` while retaining and buffering non-thinking text for accurate tool call extraction.

### 🖥️ Desktop App & Installation Quality
- **NSIS Installer Icon Persistence (`package.json`)** — Updated NSIS installer configuration with `installerIcon`, `uninstallerIcon`, `createDesktopShortcut: "always"`, and `shortcutName: "Yogatik"` so the application icon remains intact on the Windows desktop and Start Menu after installation.
- **Packaged Splash Screen Logo Resolution (`splash.html`)** — Corrected relative pathing for `logo.svg` to ensure the splash screen displays properly in production packaged Electron environments.

## v10.9.5 - Autonomous Agent Circuit Breaker, Windows Path Precision & Zero-Leak Streaming (2026-09-25)

### 🤖 Autonomous Agent & Loop Defense
- **Repetitive Failure Circuit Breaker (`agent.js`)** — Tracks consecutive failures per tool (`toolFailureCounts`). When any tool fails 2+ times consecutively (such as repeatedly attempting invalid file paths), the engine injects a priority `CIRCUIT BREAKER` directive commanding the model to stop looping and discover the workspace structure using `fs_find_files` or `fs_list`.
- **Tool Name Path Hallucination Guard (`toolReflection.js`)** — Automatically detects when a model passes the tool name as the file path argument (e.g. `{ "path": "fs_read" }`), returning an immediate actionable reflection hint before turns are burned in repetitive `ENOENT` loops.
- **Relentless Mode Action Uncapping (`agent.js`)** — Turns running with `/relentless`, `/loop`, or relentless mode enabled operate with unbounded round ceilings (`Infinity`), allowing deep multi-step engineering tasks to run until resolution without hitting artificial limits.

### ⚡ Windows Path Precision & UI Leak Protection
- **Windows Path Normalization in `repairJson` (`promptedTools.js`)** — Tolerant parsing and normalization for unescaped single and multiple backslashes in Windows file paths inside JSON payloads, eliminating `SyntaxError: Bad escaped character in JSON` failures on NVIDIA Nemotron, Qwen, and DeepSeek models.
- **Zero-Leak Tool Markup Cleansing (`promptedTools.js` + `agent.js`)** — `stripToolCallSyntax` now cleans bare and fenced JSON tool arrays (`{"tool_calls": [...]}`) and truncated tool call prefixes. Ensured fallback recovery in `agent.js` filters recovered text so unexecuted tool call JSON never leaks into user-facing chat bubbles.

## v10.9.4 - Markdown Table Loop-Breaker Fix & Pattern Precision (2026-09-25)

### ⚡ Stream Reliability & Loop Protection
- **Markdown Table Exemption (`reasoning.js`)** — Both `deduplicateRepetitions` and `createReasoningTagger` now detect pipe-delimited markdown rows (`| col | col |`) and separator rows (`| --- | --- |`) and skip loop detection entirely. Previously, NVIDIA Nemotron-3's comparative table responses were being cut off mid-render with *"…repetitive text loop truncated"* — a false positive caused by the repeating `|---|` pattern in table header separators.
- **Raised Pattern Minimum Length: 10 → 15 chars (`reasoning.js`)** — The minimum captured-group length in the regex pattern matcher was increased from 10 to 15 characters. Short table cell fragments like ` --- ` or ` col ` no longer qualify as "repeating units", eliminating another class of false positives.
- **Wider Detection Tail: 300 → 500 chars (`reasoning.js`)** — The sliding tail window used by `createReasoningTagger` for both the reasoning and content channels was extended from 300 to 500 characters, giving the detector richer context before any truncation decision fires.

## v10.9.3 - Autonomous Relentless AI Engine: Auto-Prompted Tool Calling & Stream Loop Breaker (2026-09-25)

### 🤖 Autonomous Agent & Tool Execution
- **Auto-Prompted Tool Fallback (`agent.js`)** — When a provider's capability registry indicates `providerCaps.tools === false` (e.g. NVIDIA NIM or local model endpoints), Yogatik automatically engages `toolMode = 'prompted'`, injecting tool schemas and output formatting guidelines into the system instructions so the model can invoke tools without native function calling support.
- **Bracketed Pseudo-Tool Parser (`promptedTools.js`)** — Added `parseBracketedToolCalls()` to parse plain-text bracketed tool invocations like `[Tool called: fs_file_tree {"path": "."}]` or `[Calling tool: ...]`. Eliminates execution stalls and syntax leaks when models output brackets instead of JSON blocks.
- **Visible Content Cleansing (`reasoning.js`)** — Automatically removes bracketed pseudo-tool invocations and noisy internal mechanics from the user-facing answer stream while routing tool executions faithfully in the background.

### ⚡ Stream Loop Protection & Token Preservation
- **Real-Time Stream Repetition Loop Breaker (`reasoning.js` + `llm.js`)** — Continuously monitors streaming text chunks for degenerative runaway loops (e.g. repetitive dot sequences `... ... ...` or looping sentences). Immediately cancels the SSE stream reader and terminates the turn cleanly, preventing token waste, hangs, and frozen UI states.

## v10.9.2 - Autonomous Relentless AI Engine: Provider Intelligence & Zero-Drop Streaming (2026-09-25)

### 🤖 AI Provider Intelligence Engine
- **Anthropic Native Message Converter (`toAnthropicMessages` in `llm.js`)** — Full OpenAI-to-Anthropic message pipeline: converts `tool_calls` to `tool_use` blocks, `role: tool` to `tool_result`, merges consecutive same-role turns, and prevents empty assistant content — fixing the `model output must contain either output text or tool calls` 400 error.
- **Provider Capability Registry (`llm.js`)** — Declarative `PROVIDER_CAPABILITIES` table declares tools/vision/streaming/promptCaching support for every built-in provider. Unsupported params (like tools for NVIDIA/Perplexity) are stripped before sending, eliminating silent 400s.
- **Adaptive Max-Token Limits per Model (`llm.js`)** — Dynamic `MODEL_MAX_TOKENS` lookup (30 entries) auto-resolves correct max_tokens for every major model (65,536 for Gemini 2.5 Pro; 64,000 for Claude 3.7 Sonnet; 8,192 for Groq LLaMA).
- **Anthropic Prompt Caching on All Paths (`llm.js`)** — Both `streamChat` and `chatComplete` now include `anthropic-beta: prompt-caching-2024-07-31` and ephemeral `cache_control` blocks on system prompts — reducing latency and cost on long-context turns.

### ⚡ Stream Reliability, Healthy Routing & Checkpoint Resume
- **In-Flight Request Deduplication (`llm.js`)** — `streamChat({ dedupe: true })` returns the same in-progress Promise for identical concurrent requests, preventing duplicate API calls from rapid submit clicks or React StrictMode.
- **Circuit-Breaker Failover & Smart Healthy Routing (`llm.js`)** — Providers that fail twice enter a 60s cooldown; `getHealthyRoute()` walks task-specific → general → fallback provider lists, ensuring zero interruptions.
- **Stateful Checkpoint Resume Precision (`App.jsx` + `agent.js`)** — `resumeTurn` now safely purges the failed error bubble from UI state and restores internal agent history from `checkpointMapRef` with full tool_use/tool_result fidelity.

## v10.9.1 - Seamless High-FPS Desktop & Terminal Shield Engine (2026-09-25)

### ⚡ High-FPS Desktop Rendering & Compositing Engine
- **DirectComposition MPO Stall Fix (`frontend/electron/main.cjs`)** — Removed `enable-hardware-overlays`, `enable-zero-copy`, and `ignore-gpu-blocklist` which caused Windows DirectComposition Multi-Plane Overlay plane negotiation stalls and 15-FPS frame lock. Added `disable-features=CalculateNativeWinOcclusion,HardwareOverlays,WidgetLayering` to ensure the DWM never throttles render frames when windows overlap.
- **In-Process 2D Canvas Acceleration (`frontend/electron/main.cjs`)** — Removed `CanvasOopRasterization`, keeping 2D canvas rasterization in-process to eliminate cross-process IPC command serialization bottlenecks on Windows 1.5x/1.25x display scaling.
- **Sub-Millisecond Keystroke Latency & Message Memoization (`MessageBubble.jsx`)** — Implemented custom `areMessageBubblePropsEqual(prev, next)` comparator on `React.memo(MessageBubble)`, freezing completed historical message trees in memory while typing in the composer or toggling UI controls.
- **Virtual Key Stabilization (`App.jsx`)** — Stabilized message map keys using stable IDs/clientIDs/timestamps rather than array indices to preserve DOM nodes across scroll and message streaming.
- **Compositing & Layer Optimization (`styles.css`)** — Stripped redundant Gaussian blur filters on opaque header and composer surfaces, eliminated `transform: translateZ(0)` GPU layer explosions across 50+ message bubbles, and added `will-change: scroll-position`.
- **OLE32 Mutex & Polling Relaxation (`clipboardManager.cjs`)** — Relaxed clipboard polling from 800ms to 2000ms with window visibility guards, preventing background Win32 OLE32 mutex contention.

### 🛡️ Terminal Shield & Rogue Popup Guard
- **Hidden Background Process Execution (`frontend/electron/main.cjs` + `processes.cjs`)** — Added strict `{ windowsHide: true }` to all background PowerShell, tasklist, and child process executions, preventing unhidden `conhost.exe` command prompt flashes.
- **AltGr & International Key Isolation (`App.jsx`)** — Eliminated duplicate global keydown listeners and strictly guarded terminal drawer shortcuts (`!e.altKey && !e.shiftKey && !e.repeat`), preventing accidental drawer popups when typing backticks in markdown or pressing AltGr keys.

## v10.9.0 - Stateful Turn Checkpoints & Mid-Flight Resume Engine (2026-09-25)

### 💾 Stateful Turn Checkpointing & Recovery
- **Continuous Action Checkpointing (`agent.js` + `api.js`)** — Every tool execution round, tool result, and reasoning trace is captured continuously into turn checkpoints as the turn executes.
- **Mid-Flight Resume from Action N (`App.jsx` + `MessageBubble.jsx`)** — When an API watchdog timeout, network stall, or provider error interrupts a multi-step task, completed work is preserved. Clicking **Resume from Action N** immediately re-attaches previous tool results and continues execution directly from where the model stopped, eliminating redundant rework.
- **Resume vs Restart UI (`MessageBubble.jsx`)** — Error message bubbles prominently feature a green gradient `Resume from Action N` button alongside `Restart from Scratch`, giving users total control over their recovery path.
- **Watchdog Timeout Scaling (`llm.js`)** — Extended safety watchdog timeout to 10 minutes (`REQUEST_TIMEOUT = 600_000ms`) and stream chunk watchdog to 5 minutes (`STREAM_CHUNK_TIMEOUT_MS = 300_000ms`) to accommodate massive code generation and test execution.

## v10.8.0 - Autonomous Relentless Engine: Auto-Retry, Reconnecting, Anti-Stagnation Rework & Persistent Task Memory (2026-09-25)

### 🔄 Relentless Execution & Transport Self-Healing
- **Resilient Transport Layer (`resilientTransport.js` + `llm.js`)** — Added automatic exponential backoff with full jitter for HTTP 429 (rate limits), 500, 502, 503, 504 server overload, cold starts, and network socket drops. Reconnects and pings automatically in the background while broadcasting clear status to the UI without throwing unhandled exceptions.
- **Autonomous Anti-Stagnation Rework Loop (`relentlessLoop.js` + `agent.js`)** — Tracks command and test outcomes with error signature hashing. If an identical error occurs across multiple consecutive attempts, triggers an immediate strategic pivot directive so the AI explores alternate architectures instead of repeating dead-end edits.
- **Disk-Backed Task Plan Memory (`taskPlanMemory.js`)** — Long-horizon project goals, phase checklists, and ground truth are maintained in structured `.yogatik/TASK_PLAN.md` format, persisting intent across massive compaction boundaries.
- **New Slash Command `/loop` (`SlashCommandsMenu.jsx`)** — Triggers relentless autonomous execution on any prompt, continuing until all tasks succeed or the user explicitly clicks Stop.

## v10.7.0 - Autonomous Code Execution, Self-Healing TDD, Batch Replace & Seamless Huge Chat Context (2026-09-25)

### ⚡ Autonomous Code Execution & Zero-Ambiguity Decision-Making
- **Autonomous Execution Directives (`agent.js`)** — When tasked to implement, build, fix, refactor, or test code, the AI agent autonomously decides whether to execute tests, build commands, and write code. It never pauses to ask ambiguous questions like "Should I run this?", "Would you like me to execute tests?", or "May I edit this file?".
- **Auto-Approved File Editing with Time Machine Snapshots (`features.js` + `permissions.js`)** — File writing, editing, and patching in active workspaces are auto-approved by default (`fileWriteApproval: 'auto'`), eliminating repetitive permission dialogs. Every modification is protected by Workspace Time Machine with 1-click snapshot restore.
- **Autonomous Test-and-Heal Runner (`testAndHeal.js` + `test_and_heal`)** — Automatically runs Vitest, Jest, Pytest, Go, or Cargo tests in the active workspace, parses structured failure diagnostics and assertion errors down to exact files and lines, and feeds them into the self-healing loop.
- **Atomic Multi-File Batch Replacement (`fs_batch_replace`)** — Added dedicated atomic search-and-replace across multiple files in a single turn with pre-write rollback snapshots.
- **New Slash Commands (`SlashCommandsMenu.jsx`)** — Added `/tdd` for autonomous test-driven development loops and `/refactor` for zero-ambiguity architecture cleanup.

### 🛡️ Seamless Huge Chat Scaling & Provider Message Order Compatibility
- **Compaction Boundary Tool Call Preservation (`compaction.js`)** — Compaction now strictly preserves `tool_calls` on assistant messages and `tool_call_id`/`name` on tool turns, while preventing orphaned tool messages from starting compacted histories.
- **NVIDIA NIM & OpenAI Tool Message Sequence Sanitization (`llm.js`)** — Prevents provider execution failures (`HTTP 400: Invalid message order`) by folding trailing user reminders into the preceding tool message content before payload transmission.
- **Pre-Flight Syntax Validation (`codeValidate.js` + `localFs.js`)** — Synchronous pre-flight delimiter, bracket, and tag validation on all file writes, providing immediate syntax warnings and self-healing context.

## v10.6.0 - Frontier AI Studio: Smart Follow-Ups, Visual Code Diffs, Interactive Data Sandbox & Voice Dictation (2026-09-24)

### ✨ Frontier AI Chat & Reasoning Experience
- **Dynamic Follow-Up Suggestion Chips (`FollowUpSuggestions.jsx` + `MessageBubble.jsx`)** — Assistant replies dynamically inspect the conversation turn to compute 3 smart, context-aware next action chips (writing unit tests, performance tuning, step-by-step deep dive explanations, or visual chart generation). Clicking any chip instantly submits or fills the user composer for a fluid dialogue loop.
- **Rich Web Citation Hover Cards (`CitationHoverCard.jsx` + `MessageBubble.jsx`)** — Hovering over citations `[1]`, `[2]` or search references reveals an interactive glassmorphism card featuring the target site favicon (via Google Favicon Service), verified source badge, domain link, and rich snippet preview with hover-delay dismissal protection.
- **Cursor-Style Visual Code Diff Reviewer (`DiffReviewModal.jsx` + `CodeBlock.jsx`)** — Every code snippet header now includes an interactive **Diff** button. Clicking it launches a unified red/green diff review modal computing added/removed lines, summary change metrics (`+N / -M`), and single-click **Accept & Apply**, **Reject**, or **Copy** controls.

### 📊 Artifact Canvas & Voice Audio
- **Interactive SVG Data Visualization Sandbox (`DataChartSandbox.jsx` + `ArtifactCanvas.jsx`)** — Artifact Canvas features a dedicated **Chart** tab button that parses raw CSV, Markdown tables, or JSON arrays into clean, zero-dependency SVG charts (**Bar Chart**, **Line Graph**, and **Donut Chart**) with summary metrics (Total, Average, and Percentage Share).
- **Continuous Real-Time Voice Dictation (`VoiceDictationButton.jsx` + `App.jsx`)** — Native Web Speech API STT with active glowing pulse indicators and animated 4-bar soundwave equalizer streaming transcribed clauses smoothly into the composer.
- **1-Click Smart History Compaction (`ContextMeter.jsx` + `ContextUsageModal.jsx` + `App.jsx`)** — Whenever conversation context usage exceeds 50%, an amber **⚡ Compact** badge appears in the bottom status meter. Clicking runs semantic history summarization to free 60%+ headroom while preserving key memories.

### 🛡️ Resilience, Context Self-Healing & UI Polish
- **Self-Healing Context Boundary & NVIDIA NIM Auto-Retry (`llm.js` + `api.js` + `errorLog.js`)** — Automated self-healing for context length limit errors (`"Please reduce the length of the messages or completion."`). Automatically trims intermediate turns and reduces completion reservation before retrying, preventing turn failures. Diagnosed in the UI with a 1-click **Auto-Pick High-Context Model** button.
- **Uninhibited Token Usage Across Providers & Smart Router (`smartRouter.js` + `api.js` + `llm.js` + `compaction.js`)** — Removed artificial token constraints and clamped output budgets across smart routing tables, allowing models to operate with full native context windows and unbounded output token length.
- **Favorite Project Locations (`App.jsx` + `DirectoryTreeModal.jsx` + `favoriteLocations.js`)** — Pin frequently used workspace directory paths for instant 1-click access without repetitive navigation.
- **Enforced Min-Widths on Selectors & Dropdowns (`styles.css`)** — Added strict minimum width thresholds across model pickers, provider selectors, and modal dropdowns.

## v10.5.0 - Autonomous Reasoner Recovery, Interactive RAG & Context Manager (2026-09-24)

### 📑 Local RAG Knowledge & Context Window Interactive Management
- **Interactive Local RAG Manager (`RagDocumentsModal.jsx`)** — Clicking the green `📄 RAG` badge in the composer now opens the complete RAG management hub: displays local storage details (Client IndexedDB `db.documents`), workspace project scope, total characters and passages, chunk passage previews with one-click copy, text file exports, individual document deletion, and direct file uploads into the RAG index.
- **AI Model Context Window Inspector (`ContextUsageModal.jsx` + `ContextMeter.jsx`)** — Made the composer context meter badge (`1.4k / 16.0k`) interactive with keyboard navigation and hover highlighting. Clicking it reveals an itemized breakdown of tokens (System prompt, Chat history with user vs assistant ratio, Tool payloads, Indexed RAG corpus, and Draft prompt), color-coded capacity meter, quick compaction triggers, and direct navigation to the full analytics dashboard.

### 🧠 Agent & Reasoning Engine Resilience
- **Expanded Planning Intent Recognition (`agent.js`)** — Broadened `hasUnexecutedToolIntent` to recognize multi-word connectors (`first`, `start by`, `begin by`, `next`), subjects (`I should`, `we should`, `I plan to`), and gerund/stems (`explore/exploring`, `examine/examining`, `look at`, `scan`, `review`, `debug`, `patch`), preventing premature halting when reasoning models plan tool executions.
- **Strict Turn Alternation (`nudgeIntoAction`)** — Preserved the assistant's previous thought before appending a user nudge, ensuring proper role alternation (`user` → `assistant` → `user`) and preventing API rejection or lost planning context with NVIDIA NIM, OpenAI, and Anthropic APIs.
- **Autonomous Exploratory Tool Seeding** — Automatically dispatches workspace exploration (`fs_find_files` / `fs_list`) when models plan file inspection without outputting tool syntax, waking up stalled reasoning models.
- **Actionable UI Feedback (`MessageBubble.jsx`)** — Replaced empty/suppressed assistant states with an informative card and a one-click **⚡ Continue & Execute Actions** button whenever models formulate plans without immediate tool calls.
- **Non-Blank Content Fallback Guarantee** — Added a safety synthesis net ensuring responses are never left blank even if watchdog retries are exhausted.

### 🖥️ Windows Desktop Shell & Launcher
- **Windows Taskbar Icon Persistence (`frontend/electron/main.cjs`)** — Fixed development-mode taskbar icon disappearance by dynamically setting `AppUserModelId` to `process.execPath` in dev and using `nativeImage` with `mainWindow.setIcon(appIcon)`.
- **Root Electron Forwarder (`electron/main.cjs` & `package.json`)** — Added `"main": "frontend/electron/main.cjs"` to root `package.json` and created a forwarding launcher stub at `electron/main.cjs` to eliminate module resolution errors when launching Electron from repository root.

## v10.4.0 - Chat UI UX: Live Context Meter (2026-09-23)

### ?? Chat UI UX — Live Context Awareness in the Composer
- **Context Meter wired into the composer (`App.jsx` + `ContextMeter.jsx`)** — The component was built but never mounted anywhere: estimated context usage was invisible in the chat. It now sits above the input wrapper, showing live `estimated / limit` tokens (color-coded green/amber/red) that fold the DRAFT in cheaply — the user sees the meter turn amber/red BEFORE the model truncates or compacts their history away.
- **System-prompt memoisation** — `activeSystemPrompt` recomputes only when the pieces that build it change (templates/persona/roots/entitlement — `getSystemPrompt`'s identity tracks exactly those), so a keystroke costs a string length in the meter, never a full prompt rebuild.
- **Rendering tests added (`ContextMeter.test.jsx`)** — 4 new mount tests following the WiredPanels pattern ("the component was built but never mounted, so nothing had exercised its first render"): App-shaped messages render the badge, the draft is counted cheaply (101 tokens from a 400-char draft), empty conversation renders safely, and usage past 60%/85% changes state. **7 total** in the file.

### ?? AI Max Utilisation (from this session — see AI_MAX_UTILISATION.md)
- **Hardware capability probe (`AiCapabilities.ts`)** — GPU adapter + VRAM via `app.getGPUInfo`, cores, memory, WebGPU support; cached 5-min TTL.
- **Tuned inference defaults** — Ollama `num_gpu` layers (70% VRAM budget) + `num_thread` (½ physical cores); ComfyUI resolution/steps ceilings per VRAM tier; surfaced via `desktop:getAiCapabilities` and `ollama:status`.
- **Heap scaled to the machine** — 25% of RAM clamped [512, 16384] MB, replacing the unconditional `--max-old-space-size=8192` that swap-thrashed a 4GB machine.

### ?? Bugs fixed (chat UI)
- **`utils.ts` missing `Worker` import** — resolved to the DOM Worker, so the worker pool's `.on`/`.postMessage` calls never worked.
- **`procBridge.ts` dead orphan** — imported non-existent APIs, duplicated channels already covered by `bgProcesses.cjs`, never imported → removed.
- **`ocr.worker.ts` pdf-parse v2 API** — v1 default-callable import no longer exists → migrated to the v2 class API with proper `destroy()` cleanup.

## v9.0.0 - Standalone Yogatik Browser v1.0.0, AI Privacy Engine & High-Performance Hyperdrive (2026-09-18)

### 🌐 Standalone Yogatik Browser Launch (v1.0.0)
- **Standalone Privacy Browser (`yogatik-browser/`)** — Launched dedicated standalone AI browser with isolated profile, local state persistence, and native cross-platform binaries (Windows, macOS Apple Silicon/Intel, Linux AppImage/deb).
- **AdShield & Tracker Annihilator** — Built-in zero-latency blocking for invasive tracking scripts, telemetry, intrusive ad popups, and cryptominers.
- **AI Spotlight Command Palette (`Ctrl+K` / `Cmd+K`)** — Instant omnibar actions for AI page summaries, distraction-free reading, bookmarking, full-page screenshots, and quick search engine routing.
- **Distraction-Free Reader Mode** — Content extraction engine converting articles into clean typography with Dark, Sepia, and Light reading modes and variable font scaling.
- **Theme Engine & Customization** — Pre-packaged with Midnight, Arctic, Dracula, Solarized, and Cyberpunk themes with live preview.
- **Browser Download Center** — Integrated direct download cards on `https://yogatik.web.app/` sidebar, Download modal, and `https://yogatik.web.app/platforms`.

### 🚀 Yogatik Core 9.0.0 & Desktop Release
- **Unified Multi-Platform CI/CD Pipeline** — Updated GitHub Actions workflow (`electron-release.yml`) to automatically build and release both Yogatik Desktop (9.0.0) and Yogatik Browser (v1.0.0) across Windows, macOS, and Linux into `applicationmanifester/Yogatik-releases`.
- **Version bump** — 8.5.2 → 9.0.0 across monorepo, web platforms, bot gateway, and metadata.

## v8.5.2 — Desktop Entitlement Hardening, Multi-Device Cloud Sync & Live Trading Resilience (2026-09-17)

### 🛡️ Desktop Security & Built-in Browser Entitlement
- **Pro Browser Entitlement Verification (`App.jsx`)** — Re-engineered `handleOpenBrowser` to asynchronously inspect Electron's IPC entitlement response. If locked, immediately notifies users that Yogatik Pro is required and opens the license activation modal instead of failing silently.

### ☁️ Cross-Platform Account Sync & Persistence
- **Cloud Account Sync Resilience (`firebaseAuth.js`)** — Hardened multi-device state synchronization across web, desktop, and mobile platforms with real-time Firebase Auth session resilience.

### 📈 Indian Stock Trading & Zerodha Kite Connect
- **Zerodha Kite Connect 2FA & Token Setup Guide** — Streamlined request-token auto-capture from callback URLs, instant SHA-256 session exchange, and in-depth step-by-step documentation for daily token renewal.

### 🛠 Infrastructure & Polishing
- **Version bump** — 8.5.0 → 8.5.2 across monorepo, web platforms, and bot gateway.
- **Theme Adaptivity** — Polished dark/light mode switching and high-contrast accessibility across all interactive modals and tool panels.

## v8.5.0 — Autonomous Quantitative Profit Engine & Zerodha Live Trading Suite (2026-09-17)

### 📈 Indian Stock Trading & Zerodha Kite Connect Integration
- **Zerodha Kite Connect v3 REST Client (`zerodhaClient.js`)** — Full Kite Connect v3 API suite supporting SHA-256 session exchange, margins retrieval (equity, commodity), real-time LTP quotes, and order lifecycle management (CNC, MIS, NRML; MARKET, LIMIT, SL, SL-M).
- **Zero-Risk Virtual Paper Trading Engine (`paperEngine.js`)** — Realistic simulation environment with ₹1,00,000 starting cash, real-time unrealized P&L calculations, portfolio holdings & positions tracking, and single-click wallet reset.
- **Unified Tool Interface (`zerodhaTrade.js`)** — Registered AI tool `zerodha_trade` with actions: `quote`, `margins`, `portfolio`, `orders`, `place_order`, `cancel_order`, `set_mode`, `analyze`, `scan`, and `auto_trade`.
- **Human-in-the-Loop Trade Confirmations (`TradeConfirmationCard.jsx`)** — Interactive confirmation cards in chat with automated risk/reward calculations, stop-loss and profit target preview, and 1-click execution.
- **Dedicated Trading Dashboard Modal (`TradingModal.jsx`)** — Quick access modal for Zerodha 2FA token setup, live vs paper switching, portfolio health inspection, and auto-trader scanner configuration.

### 🤖 Autonomous Quantitative Profit Engine
- **Multi-Indicator Confluence Scanner (`autoTrader.js`)** — Scans watchlists evaluating RSI, MACD crossovers, EMA 20/50 trends, Bollinger Band expansion/contraction, and ATR for composite technical scores (0-100).
- **Positive Expected Value (EV) Optimizer** — Mathematical win-rate and payout modeling (`EV = (winRate * targetGain) - ((1 - winRate) * stopLossRisk)`) preventing trades with non-positive edge.
- **Automated Profit Locking & Loss Cutting** — Dynamic position monitoring with automated profit taking at predefined targets (1:2+ R:R) and trailing stop-loss enforcement.

### 🛠 Infrastructure
- **Version bump** — 8.4.0 → 8.5.0 across monorepo, web platforms, and bot gateway.
- **Test coverage** — 100% passing Vitest suites for Zerodha client, Paper Engine, AutoTrader, Trade Confirmation, and build guards.

## v8.4.0 — High-Resilience Agent Suite (2026-09-17)

### 🛠️ High-Resilience Developer & Agent Tools
- **Unlimited JS Execution** — Integrated `desktop:eval-js` direct Electron Node VM runner completely bypassing Windows cmd.exe 8,191-character command line limits and shell escaping. Supports large scripts, data transformations, and algorithms.
- **Fuzzy-Tolerant Filesystem Matching** — Re-engineered `applyEdit` and `findFuzzyLineMatches` in `fsCore.cjs` with multi-pass tolerance for quotes (`'` vs `"` vs backticks), blank lines, indentation, and trailing semicolons/commas, with actionable closest-match line numbers on mismatch.
- **Pre-Flight Syntax Validation (`code_validate`)** — Added dedicated `codeValidate.js` tool providing instant in-memory AST and structural checking for JS, JSX, TS, TSX, JSON, HTML, CSS, and Markdown. Catches delimiter mismatches, unclosed JSX tags, and invalid JSON with exact line/column indicators.
- **Self-Correction Reflection Engine** — Refined `toolReflection.js` to accurately diagnose `fs_edit` mismatches and guide models to inspect lines via `fs_read` or patch via `fs_patch`.

### ⚡ Uncapped Autonomy & Live Telemetry
- **Uncapped Turn Autonomy** — Removed hidden tool round limits (`Infinity` rounds) in `agent.js` enabling deep, multi-phase autonomous execution loops.
- **Reflex Prefetch Monitor** — Added live Reflex Prefetch card in `DiagnosticsModal.jsx` and real-time metrics tracking in `live/metrics.js` measuring cache hit rates and prefetch latency gains.

### 🛠 Infrastructure
- **Version bump** — 8.3.0 → 8.4.0
- **Automated verification** — All Vitest test suites, build guards, and Electron FS bridge tests passing with 100% success rate.

## v8.3.0 — Sovereign AI Workstation (2026-09-16)

### ⚡ Sovereign Multi-Agent Swarms & Self-Healing Loop
- **Hierarchical Swarm Coordinator** — Introduced `agentSwarm.js` and `agent_swarm` tool for multi-agent DAG task decomposition across Planner, Coder, Critic, and QA Tester roles.
- **Shared Working Memory** — Integrated high-speed shared blackboard (`AgentBlackboard`) for facts, discoveries, and code snippets across subagents without duplicate token consumption.
- **Automated Self-Healing Loop** — Automatic retry and self-healing intercepting task and validation failures with targeted contextual diagnosis before surfacing errors.

### 🛡️ Cryptographic Action Journal & Time-Machine Rollback
- **Merkle Hash Chaining** — Created `actionJournal.js` and `action_journal` tool providing verifiable SHA-256 chained audit trails for all modifying file and shell operations.
- **Time-Machine Rollback** — Single-click session rollback restoring files and states in reverse chronological order to pre-modification snapshots.
- **Compliance Audit Exports** — Exportable SOC2 and HIPAA ready audit logs formatted in structured JSON and Markdown tables.

### 👁️ Ambient Screen Intelligence & Proactive Action Chips
- **Optical Screen Diffing** — Integrated Hamming distance perceptual hash thresholding (`screenHashDiffers`) detecting substantive screen changes while filtering anti-aliasing variations.
- **Proactive 1-Click Action Chips** — Silent, contextual quick-actions (`[Fix Detected Error]`, `[Run Test Suite]`, `[Audit Contract Risks]`, `[Summarize Key Takeaways]`) surfaced with an idle guard and 45-second cooldown.

### 🎨 Interactive Artifact Studio Canvas & Auto-Skills
- **Multi-Device Viewport Switcher** — Real-time toggle between Desktop (100%), Tablet (768px), and Mobile (375px) in `ArtifactPanel.jsx` with live preview reload.
- **Auto-Skill Distillation** — Enhanced `autoSkills.js` to automatically distill multi-turn successful sessions into spec-compliant `SKILL.md` documents with YAML frontmatter.

### 🛠 Infrastructure
- **Version bump** — 8.2.0 → 8.3.0
- **Automated verification** — 250 test files, 2,700 passed unit tests with 100% pass rate.

## v8.2.0 — Streamlined Core (2026-09-12)

### 🎯 Focused First-Impression & Streamlined Onboarding
- **Clear first action** — Replaced competing hero buttons, badges, and persona prompts with a clean, focused setup view centered on: "Choose a provider or run locally".
- **Two intuitive setup paths** — Clear choice cards for Cloud AI Providers (Gemini, Groq, NVIDIA, OpenRouter, OpenAI, Anthropic) and Run Locally on Device (100% offline WebGPU or local Ollama / LM Studio).
- **Deferred onboarding prompts** — Persona setup modal waits until a model is connected, preventing immediate popup fatigue on fresh visits.
- **Collapsible feature catalogue** — Secondary features (Quick Demo, 177 Tools catalogue, Social Hub, Desktop App) organized neatly below the primary choice.

### 🔒 Above-The-Fold Privacy Transparency
- **Honest data disclosures** — Embedded explicit privacy guarantees above the fold across the web app, noscript block, and metadata.
- **Accurate architecture copy** — Explicitly clarified browser-native IndexedDB storage, direct provider/offline connections, developer-operated CORS proxying for restricted providers, and optional Firebase encrypted cloud sync.

### 🛡️ Security & Route Integrity
- **Enforced Content-Security-Policy (CSP)** — Promoted `Content-Security-Policy-Report-Only` to enforced `Content-Security-Policy` header in `firebase.json` to actively protect API keys and mitigate XSS risks.
- **Real HTTP 404 responses** — Replaced the catch-all hosting rewrite with scoped SPA rules (`/app/**`, `/live`, and legacy shortcuts). Unmatched routes like `/does-not-exist` now correctly return real HTTP 404 status codes.
- **Dedicated 404 page & client route handling** — Added static `404.html` with `noindex` and helpful navigation links, plus client-side 404 detection in `App.jsx`.
- **Tool count synchronization** — Unified all tool count references across metadata, OpenGraph cards, PWA manifest, and documentation to the verified 177 browser-native tools catalogue.

### 🛠 Infrastructure
- **Version bump** — 8.1.0 → 8.2.0
- **Automated verification** — Added `audit_verification.test.js` and `dashboardRoutes.test.js` covering route validation, tool counts, and CSP rules.

## v8.1.0 — Apex Frontier (2026-09-11)

### 🚀 Next-Gen AI Model Readiness & Full Modal Synergy
- **Frontier & custom model parity** — Provider-agnostic streaming and dynamic schema adaptations supporting Claude Fable 5.1, GPT-6 Astra, and next-gen multimodal models.
- **Ambient UI Telemetry (`uiContext.js`)** — Live injection of viewport dimensions, active modal, active tab, color theme, and selected text into agent prompts, giving models full situational awareness.
- **Interactive Action Chips (`actionChips.js`)** — AI assistant messages dynamically emit clickable action pills for immediate prompt continuations and multi-step execution.
- **Stepped Multi-Step Progress Tree** — Hierarchical animated checklists rendered inside streaming bubbles for long-running workflows.
- **Closed-Loop Visual Layout Verification** — Artifact inspection tool measuring HTML/SVG DOM elements, typography, and responsive rules with one-click "Ask AI to Refine Layout" feedback loop.
- **App Settings & Resource Control (`app_settings`)** — Direct model access to inspect/modify app settings, list resources, save workspace documents, and programmatically open modals (`file_editor`, `settings`, `domain_hub`, `diagnostics`, `mcp`).

### 🛠 Infrastructure
- **Version bump** — 7.4.0 → 8.1.0
- **Regression suite** — 2,551 tests passing across 236 test files with 0 failures.

## v7.4.0 — Apex Autonomous Orchestrator (2026-09-09)

### 🤖 Apex – Autonomous Desktop Orchestrator (New Agent)
- **Apex agent** — A fully autonomous multi-agent persona that plans, researches, codes, edits files, runs shell commands, controls the browser, and executes complex projects end-to-end with zero hand-holding
- **Zero-friction autonomy** — Apex never asks for confirmation or permission mid-task; it acts, recovers from errors automatically, and reports only the final result
- **Full tool access** — All 195 registered tools available: filesystem, terminal, git, browser, code execution, research, documents, memory, scheduling
- **Multi-agent orchestration** — Built-in crew templates: `auto`, `sequential`, `hierarchical`, `reflexion`, `map_reduce`, `best_of_n` via `crew_orchestrator`
- **47 specialist sub-agents** — Researcher, Coder, Analyst, DevOps, QA, Writer, Architect, Scientist, and more available for delegation
- **Autonomous error recovery** — Test failures, command errors, and tool failures are all handled in a continuous fix-and-retry loop
- **Smart parallel execution** — Spawns specialists in parallel when possible; auto-sets `isolate_workspace` when agents write files simultaneously

### 🛠 Infrastructure
- **Version bump** — 7.3.0 → 7.4.0
- **Idle-registered** — `apexAgent.js` loads as a separate async chunk after first paint; zero impact on initial bundle size

## v3.13 — Emergency Hotfix (2026-09-02)
- Test entry to verify changelog updates work

## v3.13 — Zero-key Chrome AI, MCP Server, Stability & Security Fixes (2026-09-02)

### AI Provider Enhancements
- **Zero-key Chrome AI provider** — Added support for Chrome's built-in Gemini Nano via Prompt API as a zero-download, zero-account local AI provider
- **Streaming & tool calling** — Implemented proper session management and tool calling for Chrome AI provider
- **Zero-key boot** — App now tries Chrome AI first on startup when no keys are stored

### MCP & Integration
- **Standalone MCP server** — Created `frontend/mcp-server/server.mjs` exposing Yogatik tools over stdio for MCP clients
- **MCP client improvements** — Enhanced MCP connectivity (referenced in other entries)

### Stability & Bug Fixes
- **Workspace context fix** — Resolved issue where tools would operate in wrong chat's folder during concurrent chats
- **File cache scoping** — Fixed fsCache.js to be scoped per-workspace instead of path-only
- **Dark-on-dark titles** — Fixed Diagnostics and Billing panel title visibility in light theme
- **Reasoning-only reply recovery** — Added one retry chance when model returns only reasoning tags
- **No-undef crashes** - Fixed four ReferenceError crashes (askInCall, speed×2, browserSurface)
- **Payment flow blockers** - Resolved four issues preventing payments in shipped builds

### Security & Reliability
- **Guardrails output protection** — Added canary leak detection to catch prompt injection attempts
- **RAG regression evaluation** — Added automated retrieval accuracy testing to prevent regressions
- **Native deps self-heal** — Fixed recurring Windows-native-rollup-binary verification gap

### Desktop Enhancements
- **Real Chrome browser control** — Integrated full Chrome UI (address bar, zoom, etc.) into browser control
- **View-leak fix** — Patched browser view-leak issue alongside Chrome UI integration


## v3.12 — Phase 1/2: adaptation, experiments, transparency, onboarding (2026-08-16)

Implements the remaining code-able roadmap items (Phase 1 personalization + the
codeable slices of Phase 2). Backend-dependent items (premium billing, marketplace
hosting) remain documented, not stubbed.

### Personalization (Phase 1)
- `adaptation.js` — implicit procedural learning. `deriveProcedural`/`aggregateSignals`
  (pure) distil behaviour (message length, tool usage, style/persona) into procedural
  preferences past an evidence threshold; `recordTurn` buffers and `captureBehaviour`
  writes to the procedural memory store. Wired into App's main `onDone`.
- `components/OnboardingModal.jsx` — first-run flow (persona → style + boundary →
  privacy summary). Seeds procedural memory so turn 1 is already tailored; sets the
  professional-boundary expectation. Gated by `yogatik_onboarded`.

### Transparency & data ownership (Phase 2 slice)
- `components/MessageBubble.jsx` — "why did I say this" plain-language line in the
  activity trace (tools used, sources consulted, model).
- `components/DataDashboard.jsx` — view/delete per-memory and per-store, export all;
  reachable from Settings → storage details. Reinforces local-first ownership.

### Measurement infra (Phase 2 slice)
- `experiments.js` — client A/B framework: FNV-1a deterministic weighted variant
  assignment (stable per unit), flag-gated, exposure + outcome events to analytics.
- `analyticsSink.js` — opt-in PostHog-compatible batched fetch sink for `analytics.js`
  (`createPostHogSink`, `initAnalyticsFromSettings`). No SDK dependency.

### Tests
- `phase1.test.js` (13) across adaptation, experiments, analyticsSink. All pass under
  Node; all touched files parse. ~376 total.

### Not code (documented in roadmap)
- Premium billing + persona/skill marketplace hosting (need a backend).
- Blockers B1–B7 (usage/latency/cost baselines, use-case mix, regulation, team) gate
  targets, not implementation. T&S sign-off still required before the safety layer
  ships enabled.


## v3.11.2 — Crisis card + proactive check-ins (2026-08-16)

Wires the v3.11 safety + memory backends into the chat UI.

### Safety UI
- `components/CrisisCard.jsx` — soft, dismissible, non-blocking support card
  (calm styling, never replaces the model's reply).
- `api.js` `streamMessage` threads `onSafety` (via `body.onSafety`) through both
  the primary and fallback `runAgent` calls.
- `App.jsx` passes `onSafety` and renders the card above the composer when the
  on-device screen flags distress.

### Proactive check-ins
- `proactive.js` — `buildCheckin` (pure: anniversary milestone via `dueMilestones`,
  else a recent high-salience episodic follow-up) + `getProactiveCheckin`
  (storage-backed, once/day, dismissible). Never auto-sends.
- `App.jsx` — a dismissible check-in chip above the composer, gated by the
  `proactiveAgent` feature; clicking it starts the check-in via `send()`.

### Tests
- `proactive.test.js` (4). All pass under Node; touched files parse. ~363 total.


## v3.11.1 — Memory persistence + observability (2026-08-16)

Follow-through on the v3.11 Phase-0 scaffolds.

### Memory persistence
- `db.js` v5 — new `memories` table (`++id, store, at`). Flat `user_memory` blob kept.
- `memory4.js` — Dexie layer added below the pure logic: `remember` (dedupe +
  refCount/importance bump), `allMemories`, `forget`, `recallForPrompt` (usage bump),
  `memoryBlockFromStores`, salience-based prune at 500 cap. Lazy db import keeps pure
  tests db-free.
- `tools/memory.js` — `save` now also writes to the structured store; added `store`
  (episodic/semantic/procedural/emotional) + `importance` params.
- `agent.js` — `memoryBlock()` prefers the salience-ranked structured stores, falling
  back to the flat block when empty.

### Observability
- `components/DiagnosticsModal.jsx` — new Performance & Safety card: latency TTFB/total
  P50/P95 (`telemetry.latencyReport`, green when P95 < 2s target) + safety-screen golden-set
  pass rate (`evalHarness.runSafetyScreenEval`).

## v3.11 — Companion Phase-0: safety, memory, measurement (2026-08-16)

Implements the code-grounded Phase-0 deliverables from Yogatik_PM_Audit_Roadmap.md
(measurement + safety front-loaded, per the impact×confidence÷effort rule). Process
items (interviews B4/B7, hiring, A/B backend) remain as documented, not code.

### Safety (P0)
- `src/safety.js` — on-device, pure, zero-latency crisis + boundary screen.
  Crisis: self-harm / disordered-eating / violence → non-judgmental system
  directive + region-appropriate resource (988, National Alliance for Eating
  Disorders, emergency services). Boundary: medical/legal/financial → role-clarity
  ("friend ≠ doctor/lawyer/advisor"). High-recall, soft UI, never a hard block.
- `agent.js` — `runAgent` screens the user message, folds `systemDirective` into
  the system prompt, and surfaces a crisis resource card via new `onSafety` callback.

### Memory (P0)
- `src/memory4.js` — four-store framework (episodic/semantic/procedural/emotional)
  with recency half-life per store, salience scoring (importance + refs + recency),
  relevance-gated top-K selection with per-store caps, prompt-block formatting, and
  anniversary milestone detection (seed for memory-based proactive check-ins).
  Emotional store is local-only by design. Pure logic; Dexie tables to mirror it.

### Measurement (P0)
- `src/telemetry.js` — TTFB + total generation timing per turn, nearest-rank
  P50/P95, `latencyReport()` for an observability panel; forwards a coarse bucket
  to opt-in analytics. Wired into the main streaming path in `App.jsx`.
- `src/evalHarness.js` — pure grader (expect/reject/resource) + `assessSafety`
  regression screen + seed `GOLDEN_SET` (crisis, boundary, quality, injection).
  `runEval(respond)` for model-graded runs; `runSafetyScreenEval()` model-free.

### Tests
- `companion.test.js` (18) across safety, memory4, telemetry, evalHarness.
  All pass under Node; all touched files parse. +18 → ~359 total.

## v3.10 — Security, performance, sync & a11y batch (2026-08-16)

Implements all nine enhancements from FEATURE_ANALYSIS_AND_ROADMAP.md.

### Security
- **CORS proxy hardened** (`cors-proxy/worker.js`): credential (`Authorization`/
  `x-api-key`/`x-subscription-token`) forwarding restricted to a vetted provider-host
  allowlist (`DEFAULT_CREDENTIALED_HOSTS`, override via `env.CREDENTIALED_HOSTS`);
  other HTTPS targets are still relayed but stripped of credentials. Added coarse
  per-origin rate limit (120/min) and host-only audit logging.
- **CSP + headers** (`firebase.json`): `Content-Security-Policy-Report-Only`
  (report-first rollout), `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`.
- **Shared sanitiser** (`src/sanitize.js`): dependency-free `sanitizeHtml`/`sanitizeSvg`
  for external markup; diagram SVG now routes through it (dedupes the inline sanitiser).
- **Key model clarified** (`src/crypto.js`): docstring/params corrected to reflect the
  shipped account-derived (not zero-knowledge) model; `KEY_STORAGE_DISCLOSURE` surfaced
  in the provider key form.

### Performance
- **Compute-worker scaffold** (`src/workers/compute.worker.js` + `src/computeWorker.js`):
  `runInWorker(task, payload)` offloads CPU-heavy tasks off-thread with a lazy worker,
  idle-terminate, and an inline fallback when Workers are unavailable.

### Features
- **Cross-device sync de-dup** (`src/syncMerge.js`): stable per-conversation signature +
  last-write-wins `selectIncoming`; `pullCloudData('merge')` now imports only new/newer
  conversations, fixing the round-trip history duplication bug.
- **Download consent** (`src/downloadConsent.js`): size-labelled, remembered per-feature
  gate for large on-device model downloads.
- **Eviction safety** (`src/storage.js`): `shouldNudgeBackup` policy + backup timestamps.
- **Opt-in analytics** (`src/analytics.js`): consent-gated, anonymised, allowlisted-props
  event hub; wired into `toolStatus.settleTool`. Hard no-op until enabled.

### Accessibility
- `A11yAnnouncer` polite live region (announces "Response ready", not per token);
  streaming region marked `aria-busy`; `.sr-only` utility.

### Tests
- `syncMerge.test.js` (6), `enhancements.test.js` (13 across sanitize/backup/analytics/
  consent), plus existing `toolStatus.test.js` (7). All pass under Node; +19 → 341 total.

## v3.9 — Core UX & Stability: tool status + standardised errors (2026-08-16)

Phase-1 (★★★, high-impact / low-effort) from the improvement roadmap.

### Added
- `src/toolStatus.js` — ephemeral pub/sub hub tracking every tool invocation
  (running → done | error) with timing. Pure, DOM-free, unit-tested. Forwards
  failures to `errorLog` and diagnoses them via `diagnoseError`.
- `src/components/ToolStatusPanel.jsx` — live "ready / loading / failed" panel
  with an elapsed timer on long-running tools, a friendly failure line, Retry,
  and Dismiss. `role="status" aria-live="polite"`. Renders nothing when idle.
- `src/toolStatus.test.js` — 7 tests (running/done/error, diagnosis, unknown-id
  no-op, long-running threshold, unsubscribe, throwing-subscriber safety).

### Changed
- `src/components/ToolResultCard.jsx` — failed results now render a standardised
  `ToolErrorCard`: plain-language title + suggestion (from `diagnoseError`) with a
  collapsible **View details** holding the raw error + Copy. Replaces the bare
  `result.error` dump.
- `src/agent.js` — round loop calls `beginTool`/`settleTool` alongside the existing
  `onToolStart`/`onToolResult` hooks (2 additive lines; no behaviour change).
- `src/App.jsx` — mounts `<ToolStatusPanel>` above the composer; Retry re-sends via `send()`.
- `src/styles.css` — `.tool-status-*` and `.tool-error-*` rules, themed via existing vars.

### Notes
- Zero new dependencies. `diagnoseError`/`errorLog` reused, not duplicated.
- KPI targets addressed: "avg UI latency < 120ms" perception (progress feedback),
  "errors per session ≤ 1" visibility. No change to the tool execution path itself.