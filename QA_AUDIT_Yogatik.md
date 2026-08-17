# QA Audit Report — Yogatik

**App:** Yogatik (browser-native, backend-free AI chat PWA)
**Platforms:** Web (PWA) · Desktop (Electron + Tauri v2 shells) · Mobile (installable PWA)
**Version:** v3.8
**Stack:** React 18 + Vite · IndexedDB (Dexie) · direct browser→LLM calls · 65 browser-native tools · Cloudflare Worker CORS proxy · Firebase Auth/Firestore (lazy)
**Audit basis:** Source review (`crypto.js`, `cors-proxy/worker.js`, `tools/http.js`, `sw.js`, agent/LLM layer), `CLAUDE.md` architecture notes, and the 315-test vitest suite.
**Audit date:** 2026-08-16

---

## Executive Summary

Yogatik is a mature, unusually well-engineered zero-backend AI client. Its defining strength is honesty about its own constraints: the codebase documents dozens of hard-won edge cases (SSE truncation, weak-model tool rejection, datacenter-IP rate limits, PWA chunk-reload traps) and backs them with a broad, meaningful test suite. Core functionality — streaming chat, function-calling agent loop, retrieval, vision, voice, and on-device media generation — is architecturally sound and defensively coded.

The most significant risks are concentrated in the trust boundary of the shared CORS proxy and the API-key encryption model, where the code and the documented design disagree (passphrase-derived vs. account-derived secret) and where the proxy forwards user credentials to arbitrary HTTPS hosts. These are design-level rather than crash-level issues, but they carry the highest impact because they touch secrets and third-party endpoints. Everything else is polish: accessibility gaps typical of chat UIs, degraded-capability paths that are honest but could be surfaced earlier, and a handful of platform-specific fragilities (mobile OAuth redirect, Ollama gating) that are already partially mitigated.

Overall grade: **strong**. The product is production-viable today. The prioritized roadmap below focuses on closing the secret-handling and proxy-trust gaps first, then hardening accessibility and cross-platform auth.

**Findings at a glance:** 0 Critical · 3 High · 6 Medium · 5 Low.

---

## Severity Rating Table

| ID | Finding | Dimension | Severity |
|----|---------|-----------|----------|
| H-1 | Key encryption model in `crypto.js` (passphrase/PBKDF2) contradicts documented account-derived sync; unclear which path ships | Security/Privacy | High |
| H-2 | CORS worker relays user `Authorization` to any user-supplied HTTPS host (credential-forwarding / SSRF-adjacent) | Security | High |
| H-3 | Mobile/PWA Google OAuth redirect chain is fragile; multiple documented dead-end states | Functional/Compatibility | High |
| M-1 | Encryption "at rest, not zero-knowledge" not clearly disclosed to users storing keys in Firestore | Privacy | Medium |
| M-2 | Blind-model vision/OCR fallback can trigger ~230MB download; consent gating is late and easy to miss | UX/Performance | Medium |
| M-3 | Weak/retired-model handling relies on runtime 400 detection; first-turn failures still reach some users | Stability | Medium |
| M-4 | Accessibility: streaming imperative DOM updates and collapsible panels lack consistent ARIA live/labels | Accessibility | Medium |
| M-5 | YouTube transcripts / some relays are structurally unobtainable; user sees capability that often fails | Functional | Medium |
| M-6 | IndexedDB eviction risk if `storage.persist()` denied; no proactive backup nudge | Stability/Data | Medium |
| L-1 | Provider/model probe latency can surface as long "Verifying…" states on cold keys | UX | Low |
| L-2 | Usage meter is char-estimated (~4/token), labelled approximate but can mislead on cost | UX | Low |
| L-3 | Local/WebLLM zero-key boot downloads ~350MB; progress shown but bandwidth cost easy to trigger | Performance | Low |
| L-4 | Long-conversation context window (24k/20 turns) can silently drop older inlined docs | Functional | Low |
| L-5 | Emoji/markdown rendering and RTL/locale coverage untested beyond `navigator.language` for voice | Compatibility | Low |

---

## Critical Issues

No defects rise to Critical (data-loss on normal use, remote code execution, or total unavailability). The three High-severity items below are the audit's top priorities.

### H-1 — API-key encryption model is internally inconsistent
**Impact:** `crypto.js` implements passphrase-derived AES-GCM-256 with PBKDF2 (310k iters, OWASP-aligned) and its header comment states "the passphrase that derives the key is never stored or transmitted." `CLAUDE.md` instead describes an **account-derived** secret (`accountSecret(uid)`) with "No passphrase anywhere" and automatic, unconditional sync. These two models have very different security properties: an account-derived key means anyone with account access (or Firestore/UID compromise) can derive the key, whereas a passphrase model is zero-knowledge but breaks silent multi-device sync. Shipping one while documenting the other risks a false security promise and a maintenance trap.
**Fix:** Pick one model explicitly. If account-derived sync is the shipped behavior, delete/retire the passphrase path in `crypto.js` and correct its docstring; document the threat model as "encryption at rest scoped to the owner UID, not zero-knowledge." If zero-knowledge is intended, wire the passphrase path into `saveProviderApiKey`/`syncCloudKeys` and drop the "automatic, nothing to type" claim. Add a test asserting which `deriveKey` input is actually used in the sync path.

### H-2 — Shared CORS proxy forwards credentials to arbitrary HTTPS destinations
**Impact:** `cors-proxy/worker.js` restricts *callers* by Origin allowlist but, by design, accepts any HTTPS `X-Target-URL` and forwards the client's `Authorization` header to it. A malicious or compromised page served from an allowed origin (or an XSS on `yogatik.web.app`) could exfiltrate a user's provider key to an attacker-controlled HTTPS endpoint via the proxy, and the proxy can be used as a generic request relay. `tools/http.js` mitigates the public-relay case ("public relays are never given credentials"), but the *worker* itself has no destination allowlist.
**Fix:** Constrain the worker to a maintained allowlist of known provider hosts (NVIDIA and any others that genuinely need proxying), or require a signed/pinned target list. At minimum, never forward `Authorization` to a host outside a vetted set; strip it otherwise. Add rate-limiting per Origin and log target hosts. Document that user-configured custom endpoints route directly (browser CORS), not through the credential-carrying proxy.

### H-3 — Mobile / installed-PWA Google sign-in is fragile
**Impact:** `CLAUDE.md` records multiple real dead-ends: `signInWithPopup` opening a tab that never settles on Android Chrome, `redirect_uri_mismatch` when `authDomain` is switched to `.web.app` without registering the handler URI, and `getRedirectResult` returning null so a signed-in user appears signed out. Each has a documented fix, but the surface is brittle and version-sensitive (Safari 16.1 storage partitioning). A broken auth path blocks cloud key sync and account features on exactly the platform (mobile) the app targets first.
**Fix:** Add an automated auth smoke path (or manual release checklist) covering: installed PWA redirect, Android Chrome tab redirect, iOS Safari redirect, and popup-desktop. Keep the 15s escape-hatch UI, and add a persistent "sign-in stuck?" diagnostic that reports which stage failed (`yogatik.authRedirect` flag state). Verify the authorized redirect URI in the OAuth client is part of deploy verification, not tribal knowledge.

---

## Minor Improvements

### M-1 — Disclose the privacy model for cloud-synced keys
Keys synced to Firestore are encrypted at rest but (per the documented design) recoverable by the account holder/service, not zero-knowledge. Users reasonably assume "encrypted" means "unreadable by anyone but me." Add a one-line disclosure in the key UI and Settings ("Encrypted at rest, scoped to your account — not zero-knowledge") and link it to the backup exclusion note (keys are excluded from `downloadBackup` by design).

### M-2 — Make the on-device vision/VLM download consent unmissable
The blind-model fallback can pull ~230MB (SmolVLM) or ~23MB (semantic re-rank) after a user simply attaches an image. Consent is gated (`features.localVision`), but the trigger is easy to hit unknowingly. Surface an explicit, blocking "Download 230MB on-device vision model?" prompt at first use with a size estimate, and remember the choice. Same for WebLLM's ~350MB zero-key boot (L-3).

### M-3 — Move weak/retired-model detection earlier
Handling of models that 400 on a tools array or on `role:tool` history is robust but reactive: some users still hit a first-turn failure before `demoteToPrompted`/`pruneRetiredModel` caches the mode. The `autoPickModel` tool-mode pre-probe helps; extend it so *every* newly selected model is probed for tool mode and liveness before the first real message, not only auto-picked winners.

### M-4 — Accessibility pass on streaming and collapsible UI
Streaming text is written imperatively (`StreamingMessage.jsx`) outside React state for performance — good for perf, but screen readers need an `aria-live="polite"` region and completion announcement. Collapsible "Thinking"/"Show more" panels and tool-result cards need consistent `aria-expanded`, labels, and keyboard focus order. Audit color contrast in both themes and ensure the composer/model-picker sheet is reachable and dismissable by keyboard.

### M-5 — Set honest expectations for structurally-unavailable capabilities
YouTube transcripts are documented as keylessly unobtainable from datacenter IPs, and several relays 429 predictably. The tool already returns a `transcript_note`, but the *UI* still presents "youtube" as a working tool. Add a capability hint so users aren't surprised, and offer the paste/upload-transcript path proactively rather than only after failure.

### M-6 — Proactively protect against IndexedDB eviction
`storage.persist()` is requested at startup, but if denied the origin is best-effort and the browser can evict all chats, docs, and keys. Detect the "best-effort" state, warn in Settings, and nudge a `downloadBackup()` on a schedule or after N conversations so a silent eviction is never total data loss.

---

## Recommendations

Strengths worth preserving:

- **Test discipline.** 315 tests spanning agent loop, retrieval, live protocol, vision heuristics, crypto, and migrations — including regression harnesses for weak-model tool parsing. Keep new gotchas paired with a test, as the codebase already does.
- **Honest degradation.** The app consistently prefers an explicit "could not be read / can't see natively" over silent wrong answers (vision fallback, blind-model notes, empty-reply notice). This is a genuine product differentiator; do not regress it for polish.
- **Performance architecture.** Heavy deps are lazy-loaded, streaming is isolated from React re-renders, and the encode loop avoids throttled timers. Continue enforcing the "no static heavy imports" rule in CI (bundle-size gate).

Targeted recommendations:

1. **Establish a single source of truth for the security model** (resolves H-1/M-1): one document that states key storage, derivation, sync, and threat model, and make `crypto.js` conform to it.
2. **Harden the proxy trust boundary** (H-2): destination allowlist + credential stripping + per-origin rate limits, with logging.
3. **Add a release checklist** covering auth on the four platform paths (H-3), a bundle-size ceiling, an eslint/lint gate (already used), and a persistence-state check.
4. **Instrument capability honesty in the UI** (M-2/M-5): pre-download consent prompts and capability hints so cost and limitations are visible before the user commits.
5. **Accessibility remediation sprint** (M-4): ARIA live regions, focus management, contrast — measured against WCAG 2.1 AA.

---

## Next Steps

Prioritized roadmap:

1. **Now (security-critical):** Resolve the encryption-model inconsistency (H-1) and lock down the CORS worker's destination/credential handling (H-2). These touch user secrets and should ship before further feature work.
2. **This release:** Add the multi-platform auth verification path and stuck-sign-in diagnostics (H-3); add the encryption/privacy disclosure in the key UI (M-1).
3. **Next release:** Pre-download consent prompts for on-device models (M-2, L-3); earlier tool-mode/liveness probing for all selected models (M-3); persistence-state warning + backup nudge (M-6).
4. **Ongoing hardening:** Accessibility remediation to WCAG 2.1 AA (M-4); capability hints for structurally-limited tools (M-5); polish for probe latency (L-1), usage-estimate labeling (L-2), and context-window doc retention (L-4); expand locale/RTL and markdown rendering coverage (L-5).
5. **Process:** Fold the above into the existing test-and-lint gate so each fix ships with a regression test, matching the codebase's established practice.
