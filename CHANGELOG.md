# Changelog

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