# Changelog

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