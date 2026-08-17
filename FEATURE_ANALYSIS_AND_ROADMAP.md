# Yogatik — Feature Analysis & Enhancement Report

**System:** Yogatik — browser-first AI chatbot (PWA + Electron/Tauri desktop)
**Version basis:** v3.9 · **Date:** 2026-08-16
**Grounding:** codebase (`CLAUDE.md`, source), QA audit, roadmap document

---

## 1. Summary of Existing Functionality

Yogatik is a zero-backend AI client: everything runs in the browser, with an optional native desktop shell. Its core building blocks are already mature.

**Chat & agent core**
- Streaming chat against Groq, OpenRouter, OpenAI, NVIDIA, Ollama, and on-device WebLLM.
- OpenAI-style function-calling agent loop with a **native → prompted** fallback for weak models, parallel tool rounds, and a bounded tool-round budget.
- Per-message model selection, auto model-pick, per-message routing, and provider fallback chains.

**Tooling (65 browser-native tools)**
- Web search / deep research, document RAG (BM25 + optional semantic re-rank), Pyodide code execution, image generation, OCR, PDF extraction, diagrams, charts, translation, TTS/STT, on-device video rendering with narration, QR, and more — all keyless or user-key.
- New in v3.9: a **tool-status hub** (`toolStatus.js`) + **ToolStatusPanel** and **standardised, diagnosed error cards** with expandable details and retry.

**Data & sync**
- IndexedDB (Dexie) for conversations, documents, settings, and keys; `storage.persist()` on startup.
- Firebase Auth + Firestore key sync (AES-GCM encrypted at rest); backup export/import.

**Platforms**
- Installable PWA (service worker, share target, shortcuts), Electron shell (tray, notifications, auto-update, native menu), and Tauri shell (scoped `fs_*`).
- Live "face-to-face" voice mode (Gemini realtime + a cascade STT→LLM→TTS engine), on-device vision fallback, MCP client for external tool servers.

**Quality baseline**
- 322 automated tests, an on-device error log with a `diagnoseError` classifier, and extensively documented edge cases.

---

## 2. Proposed Feature Improvements

Each item lists the **problem**, a **suggested design**, and the **expected benefit**.

### 2.1 Pyodide & heavy tools in a dedicated Web Worker
- **Problem:** CPU-heavy tools (Pyodide, OCR, video encode) and a >5 MB bundle can block the main thread and slow first paint, especially on mobile.
- **Design:** Move Pyodide/Tesseract/encode into a dedicated worker (`worker-pyodide.js`), lazy-loaded on first use, results via `postMessage`; keep the stateful-kernel semantics. Split rarely-used tools into dynamic imports.
- **Benefit:** No UI jank during compute; smaller initial bundle; mobile LCP < 2s target becomes reachable.

### 2.2 Content-Security-Policy + output sanitisation
- **Problem:** Tool payloads and LLM output are inserted into the DOM; there is no CSP, and external HTML/Markdown could carry injection.
- **Design:** Add a CSP via Firebase Hosting headers + meta tag; route all externally-sourced HTML through a `sanitise()` helper (DOMPurify) before render (the diagram SVG path already sanitises — generalise it).
- **Benefit:** Closes the largest XSS surface; raises the security-audit grade toward A.

### 2.3 Harden the shared CORS proxy trust boundary
- **Problem:** The Cloudflare worker forwards the user's `Authorization` to *any* HTTPS destination (origin-allowlisted callers only) — a credential-forwarding risk.
- **Design:** Constrain forwarding to a vetted provider-host allowlist; strip `Authorization` for hosts outside it; add per-origin rate limits + target logging.
- **Benefit:** Prevents key exfiltration via a compromised/XSS'd origin; makes the proxy safe to keep shared.

### 2.4 Resolve the key-encryption model & disclose it
- **Problem:** `crypto.js` implements a passphrase/PBKDF2 scheme, but sync is documented as account-derived — the two disagree on the threat model, risking a false security promise.
- **Design:** Pick one model, make `crypto.js` conform, and add a one-line in-UI disclosure ("encrypted at rest, scoped to your account — not zero-knowledge") near key entry.
- **Benefit:** Accurate user expectations; removes a maintenance trap.

### 2.5 Cross-device chat sync
- **Problem:** Conversations live only in local IndexedDB; users lose context moving between devices.
- **Design:** Sync conversation/document metadata through Firestore behind the existing auth, last-write-wins first, CRDT later for offline merges; user opt-in.
- **Benefit:** Continuity across devices; a strong retention driver.

### 2.6 Accessibility pass (WCAG 2.1 AA)
- **Problem:** Streaming text is written imperatively (no live region); collapsible panels and the model-picker sheet lack consistent ARIA/focus handling; contrast unverified in both themes.
- **Design:** Add an `aria-live` region for streaming + completion announcement, `aria-expanded`/labels + keyboard focus order on panels, an audited high-contrast theme, and a documented shortcut map.
- **Benefit:** Broader reach, compliance, and better keyboard UX for everyone.

### 2.7 Pre-download consent for on-device models
- **Problem:** Attaching an image or enabling semantic search can silently pull 23–230 MB (VLM/embeddings); WebLLM zero-key boot pulls ~350 MB.
- **Design:** A blocking, size-labelled "Download N MB?" prompt at first use, remembered per feature.
- **Benefit:** No surprise bandwidth/storage cost; more trust on metered connections.

### 2.8 Privacy-first analytics (opt-in)
- **Problem:** No visibility into which tools/features are used or where errors cluster, so prioritisation is guesswork.
- **Design:** Opt-in event hooks (PostHog or self-hosted) emitting anonymised tool-success/latency/error events; off by default, transparent toggle.
- **Benefit:** Data-driven roadmap; measurable KPIs (tool success ≥ 95%, errors/session ≤ 1).

### 2.9 Eviction-safety nudge + richer export
- **Problem:** If `storage.persist()` is denied, the browser can silently evict all local data; export exists but isn't surfaced proactively.
- **Design:** Detect "best-effort" storage state, warn in Settings, and nudge a backup after N conversations; add one-click JSON/PDF export/import to the toolbar.
- **Benefit:** No silent total data loss; easier backup/collaboration.

---

## 3. Technical Feasibility & Required Resources

| # | Enhancement | Feasibility | Effort | Key resources / dependencies |
|---|-------------|-------------|--------|------------------------------|
| 2.1 | Pyodide → Web Worker | High — pattern already used for encode/whisper | Medium | Worker plumbing, message protocol, regression tests |
| 2.2 | CSP + sanitisation | High — SVG sanitiser exists to generalise | Low | DOMPurify, Firebase Hosting header config |
| 2.3 | Proxy hardening | High — worker is small/self-contained | Low–Med | Cloudflare Worker edit, host allowlist, rate-limit KV |
| 2.4 | Key-model resolution | High — localized to `crypto.js`/sync | Medium | Decision + test asserting the shipped path |
| 2.5 | Cross-device sync | Medium — Firestore present; conflicts are the hard part | High | Firestore schema, opt-in UI, (later) CRDT lib |
| 2.6 | Accessibility (AA) | High — mostly additive markup | Medium | ARIA work, contrast audit, axe/Lighthouse |
| 2.7 | Download consent | High — feature flags already exist | Low | UI prompt, per-feature remembered choice |
| 2.8 | Analytics (opt-in) | High — hook points exist in agent | Medium | PostHog SDK (lazy), consent gate, privacy note |
| 2.9 | Eviction nudge + export | High — `storage.js`/`chatExport.js` exist | Low | Storage-state check, toolbar buttons |

**Cross-cutting resources:** existing 322-test vitest suite (extend per feature), eslint + bundle-size gate, one Firebase project, one Cloudflare Worker. No new backend service is required except optional analytics.

---

## 4. Prioritisation & Implementation Timeline

Ordered by security/impact per unit effort. Suggested cadence assumes small increments with tests each step.

**Sprint 1 — Security & quick wins (highest priority)**
- 2.3 Proxy hardening · 2.2 CSP + sanitisation · 2.4 Key-model resolution + disclosure.
- Rationale: these touch secrets and the largest injection surface; mostly Low effort.

**Sprint 2 — Performance & trust**
- 2.1 Pyodide/heavy-tool worker offload · 2.7 Download-consent prompts · 2.9 Eviction nudge + export.
- Rationale: perceptible responsiveness and no surprise costs; unblocks mobile LCP target.

**Sprint 3 — Reach & insight**
- 2.6 Accessibility to WCAG 2.1 AA · 2.8 Opt-in analytics.
- Rationale: broadens audience and turns on measurement to guide later work.

**Sprint 4 — Feature expansion**
- 2.5 Cross-device sync (LWW first, CRDT follow-up).
- Rationale: highest effort and highest conflict risk; do last, informed by analytics from Sprint 3.

Each sprint closes with: tests green, lint + bundle-size gate, `CHANGELOG.md` + `CLAUDE.md` updated.

---

## 5. Risks & Trade-offs

- **Worker offload (2.1):** message-passing serialization overhead and image/base64 transfer cost; mitigate with transferable objects and by keeping the kernel stateful. Risk of regressions in the 65-tool surface — gate behind tests.
- **CSP (2.2):** an over-strict policy can break legitimate CDN/esm.run lazy imports and inline styles; roll out in report-only mode first, then enforce.
- **Proxy allowlist (2.3):** user-configured custom provider endpoints that need proxying would break; document that custom endpoints route direct (browser CORS) and only vetted hosts get credentials.
- **Key-model decision (2.4):** choosing account-derived keeps silent multi-device sync but is *not* zero-knowledge; choosing passphrase is zero-knowledge but breaks frictionless sync. This is a product trade-off, not just technical.
- **Cross-device sync (2.5):** conflict resolution and privacy of synced content; LWW can lose edits, CRDT adds bundle weight and complexity. Keep opt-in and encrypt in transit/at rest.
- **Analytics (2.8):** any telemetry risks eroding the app's privacy-first positioning; must be opt-in, anonymised, and clearly disclosed, or it becomes a liability rather than an asset.
- **Accessibility live regions (2.6):** overly chatty `aria-live` can spam screen readers during streaming; announce completion, not every token.
- **General:** every item competes for the same small maintenance budget; the additive, test-first, small-increment approach (already the codebase norm) is the main safeguard against destabilising a working system.
