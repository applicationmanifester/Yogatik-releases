# Yogatik 4.2.0 — pending release summary

**Date:** 2026-09-02
**Version:** 4.1.4 (last tag) → **4.2.0** (pending — not yet committed or tagged)
**Range:** working tree vs `v4.1.4` (0 commits ahead — everything below is uncommitted)
**Diff:** 32 files touched, +1,917 / −5,029 (line-ending noise excluded — the raw `git diff`
reports 101 files / +17,701 / −20,813, almost all of it CRLF↔LF churn on files nobody edited;
`--ignore-space-at-eol -w` is what the numbers above use) · 4 new untracked files
**Status:** **pending** — nothing in this range is committed, tagged, or deployed yet

---

## Two independent threads of work sit in this range

Everything below was already in the working tree, uncommitted, before this pass started —
`version.js` already carries a written 4.2.0 changelog entry, so most of it is a prior session's
finished work that was never committed. This pass added the browser-chrome/Reflex-Prefetch half
and wrote this summary; it did not touch the account/auth/perf half beyond reading and verifying
it against the diff.

1. **Desktop account linking, startup performance, and a payment-flow crash** — pre-existing in
   the working tree, documented in `version.js`'s own in-app changelog.
2. **Browser real chrome + Reflex Prefetch** — this pass's own work (already logged in `CLAUDE.md`
   under today's date, in full detail).

---

## 1. Desktop account linking was broken at the token level

**The bug, in one sentence:** the desktop app's native Google sign-in returned a Firebase-minted
ID token, but the renderer's own separate Firebase SDK instance needs Google's own OAuth token to
authenticate itself — `GoogleAuthProvider.credential()` silently rejects the wrong kind, so
`f.auth.currentUser` was never actually set on desktop, and every Firestore read/write (API key
sync, chat/doc vault sync) went out unauthenticated and was silently refused by the security rules.

- `auth-desktop.html` now also captures Google's own token via
  `GoogleAuthProvider.credentialFromResult(result)` (`googleIdToken`), separate from the
  Firebase-minted `idToken` the licence server verifies — two different tokens for two different
  jobs, no longer conflated.
- `firebaseAuth.js` gained `ensureFirebaseAuth()`, called once before any Firestore read/write: if
  `f.auth.currentUser` is still null after a relaunch (the desktop native bridge restores the
  cached profile from `localStorage`, but never re-initializes the Firebase SDK's own session), it
  signs the renderer's Firebase instance in with the cached `googleIdToken`. Non-fatal on failure —
  Firestore rejects the request exactly as before, never worse.
- `main.cjs` passes `googleIdToken` through its native-OAuth IPC response; `entitlement.js`'s
  licence refresh now asks `getIdToken({ forceRefresh: false })` for a live token instead of
  resending the one captured at sign-in.
- **A second, related bug:** `App.jsx`'s window-focus entitlement recheck was passing
  `user?.idToken` explicitly — a snapshot from the moment of sign-in. Firebase ID tokens expire in
  about an hour, so any focus check after that sent an already-expired token, the licence server
  401'd it every time, and the local licence cache eventually aged out with nothing to renew it —
  which is what a signed-in, actually-paying desktop customer would see as "Trial ended." Removed
  the explicit token so `refreshEntitlement`'s own `getIdToken()` fallback fetches a current one.
- `AccountPage.jsx`'s locked-state copy said "Your trial has ended" for every lock reason,
  including ones that mean the opposite of what they say to a Pro customer (a refresh that never
  reached the server, a signature it couldn't verify, a token for the wrong account). It now names
  the real reason: no licence yet, wrong account, clock rollback, awaiting renewal, or an honest
  fallback for anything else.

**Not independently re-verified this pass** — this sandbox cannot open a real Electron window or
complete a Google OAuth popup, so the fix was checked by reading the code and the comments left
alongside it (which name the exact failure precisely), not by driving a real sign-in. Worth a
manual desktop sign-in test — on a fresh profile and on a relaunch — before this ships.

## Startup got faster; two smaller fixes came with it

- `main.jsx` now kicks off `warmToolRegistry()` (the ~195-tool registry, already lazy-loaded per
  `agent.js`'s own dynamic import) on `requestIdleCallback` right after first paint instead of
  leaving it to load cold on the user's first real message. Combined with extracting App.jsx's
  pure helpers (`formatLatency`, `getStatusIcon`, `formatDirectTimeAnswer`, `WINDOW_STEP`,
  `SUGGESTIONS`) into a new `appHelpers.jsx` module, the initial bundle is reported at **1.79MB →
  1.18MB (587KB → 386KB gzipped), about a 34% cut**.
- The `?paid=1` payment-success return path called `setSystemMsg(...)`, a function that no longer
  exists on this branch of App — a `ReferenceError` right after a customer's card was charged,
  which throws inside a render path and blanks the whole app behind the error boundary. Both call
  sites now use the existing toast system (`showToast`).
- `subAgentRunner.cjs`'s Python RPC bridge had two real bugs: `pythonProc.stdout.on('data', ...)`
  treated every OS buffer flush as a complete JSON line, so a response split across two `data`
  events was silently discarded as a parse error; and the ready-callback stored the spawned
  sub-agent under the *raw* `agentId` parameter while every lookup (`subAgents.has`, the duplicate
  check, external callers) uses the *sanitized* `id` from `assertAgentId()` — a spawn could
  "succeed" and then be unfindable. Fixed with a line-buffering accumulator and by keying the
  registry consistently on `id`; timeouts now also kill the stuck process instead of leaving it
  running past its own caller giving up.
- `jsExec.js`'s desktop path checked `typeof Buffer !== 'undefined'` — changed to
  `typeof globalThis.Buffer`, an explicit lookup rather than a bare identifier reference in a
  browser-hosted module.
- `frontend/public/platforms.html`: the macOS and Linux download buttons switched from a
  "Build coming soon" placeholder to real links (`Yogatik-arm64.dmg` / `Yogatik-x64.dmg` for
  Apple Silicon and Intel separately, `Yogatik.AppImage` / `Yogatik.deb` for Linux) — the CI
  release matrix now actually publishes those artifacts.
- Housekeeping: `pnpm-workspace.yaml` and `pnpm.workspace.yaml` (a dead pnpm-monorepo scaffold —
  this repo uses npm workspaces) removed from the repo root; `package.json`/`package-lock.json`
  bumped toward 4.2.0; `electron` pinned to an exact `43.5.0` instead of a `^43.3.0` range.

---

## 2. Browser real chrome + a view-leak fix, and Reflex Prefetch

Both are logged in full in `CLAUDE.md` under **2026-09-02** — the summary here is intentionally
short; read those two entries for the design reasoning.

**Browser: real chrome (address bar, zoom, find, downloads) + a view-leak fix.** The desktop
in-app browser (`browser_control`) had no human-facing chrome at all — no address bar, no
back/forward/reload, no manual new tab — in either window mode or the docked panel. Added both,
plus deepened the agent-facing tool: `zoom_in`/`zoom_out`/`zoom_reset`, `find_text` (real
`webContents.findInPage`), `list_downloads`, and a genuinely new capability, `wait_for_download` —
click a download link as normal, then poll until it completes and get back its real local
`savePath`, which `fs_read` can then open. Also fixed three real reliability bugs found in the
same pass: a `WebContentsView` orphaned (never `removeChildView`'d) on a renderer crash, a dead
session field write on reload that happened to look load-bearing, and no session cleanup when a
conversation was deleted rather than switched away from.

**Reflex Prefetch.** A small, deliberately conservative whitelist of side-effect-free tools
(unit/expression math, an explicitly-named place's weather, a known city's clock, a plainly-worded
translation) is pattern-matched from the raw user message and started running in the *background*
before the model has replied — in parallel with its first inference call, not instead of it. If
the model's real tool call ends up matching, the round loop reuses the already-in-flight result
instead of paying for it twice; a mismatch just means the speculative promise is never consulted.
Grew out of a user request to "invent" instant-decision/quantum-style agent behavior — declined
the literal framing (no quantum hardware exists, faking one would be dishonest) and built the
honest version instead, on top of this codebase's own existing `seenCalls`/`callSignature`
per-turn cache and `prioritizeToolSchemas`' non-LLM keyword scoring.

---

## Verification

| Check | Result | Scope |
|---|---|---|
| `agent.test.js` + `agentReflex.test.js` | **83 passed** | Reflex Prefetch + agent loop, this pass |
| `browserControl.test.js` + `browserTree.test.js` | passing (part of the 83 above's neighbors) | Browser tool + pure detectors |
| `buildGuards.test.js` (reachability) | **15 passed** | Confirms `agentReflex.js` is wired into `main.jsx`'s real entry graph, not a dead file |
| `npx eslint@9 src/` | **0 errors** (238 pre-existing warnings, unchanged) | Whole `frontend/src` tree |
| `npx vite build` | **succeeded** — real production bundle, no new warnings | Whole app |
| Full `npm test` (~1150+ tests) | **not completed this pass** | This sandbox's ~178s per-call cap cannot run the whole suite in one pass — same constraint recorded throughout `CLAUDE.md`'s history |
| Desktop auth fix (Google sign-in, Firestore sync) | **not independently re-verified this pass** | No Electron/OAuth available in this sandbox — checked by reading the diff and its own inline reasoning only |

---

## Status

**Nothing in this range is committed.** `HEAD` is still `v4.1.4`; every file above is a working-tree
change. `package.json` / `frontend/package.json` already read `4.2.0` and `version.js` already
carries the 4.2.0 changelog entry, but no commit, tag, or deploy has happened for it.

---

## Open items

**1. `frontend/electron/edition.json` is toggled to `{"edition": "studio", "productName": "Yogatik
Studio"}`**, differing from the tracked `"store"` / `"Yogatik"` value. This looks like a local
build-target toggle left dirty rather than an intended release change — worth checking before
committing, since it changes what a desktop build reports itself as.

**2. The desktop account-linking fix needs a real sign-in test** — fresh profile and a relaunch —
before shipping; this sandbox cannot exercise Electron's native OAuth popup or a real Firestore
round trip.

**3. Full test suite hasn't been re-run in one pass since v4.1.4.** Verification this round was
scoped to the files each change touched (the same practice `CLAUDE.md` documents throughout its
history), not an end-to-end run.

**4. Nothing is tagged.** Once the two items above are checked, the natural next step is committing,
bumping the tag to `v4.2.0`, and running the release build/deploy steps `CLAUDE.md`'s own "Run"
section documents.

---

## Design docs / further reading

- `CLAUDE.md` → **"Reflex Prefetch — speculative tool execution ahead of the model's own decision
  (2026-09-02)"**
- `CLAUDE.md` → **"Browser: real chrome (address bar, zoom, find, downloads) + a view-leak fix
  (2026-09-02)"**
- `frontend/src/version.js` → the in-app 4.2.0 changelog entry (`APP_RELEASES[0]`)
