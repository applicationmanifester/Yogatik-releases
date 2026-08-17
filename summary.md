# Yogatik — Session Summary

Covers this session's work end to end: per-chat desktop folders, a real safety
layer, a finance/quant suite, video rendering fixes, and shipping the app to
web plus a multi-platform desktop mirror. 1011 tests passing, 0 lint errors.

*(This replaces a prior copy of this file that described an unrelated earlier
session — agents subsystem, cloud sync, live-mode echo fix, etc. That work is
not part of what's below; see git history around commits before this session
if you need it.)*

---

## Per-chat working folders (Electron desktop)

Replaced the single app-wide granted folder with a per-chat model, mirroring
how a `claude` session owns its launch directory (Claude Code's `/add-dir`).

- **`electron/rootsCore.cjs`** — pure resolution logic (no `require('electron')`,
  so vitest reaches it under jsdom): root-id hashing, `chat → project → default`
  binding resolution, `resolveWithin` containment (realpath re-check anchored on
  the nearest *existing* ancestor — closes a symlink-escape gap the old guard had).
- **`electron/roots.cjs`** — JSON persistence, native folder picker, `roots_*`
  IPC. Migrates the old single `granted_folder.txt` into every chat's default
  binding on first run, so nothing breaks for existing users.
- **`fsBridge.cjs`** reduced to file operations only; every handler takes
  `ctx = {conversationId, projectId}`.
- Renderer: `setWorkspaceContext()` injects ctx into every tool call — never a
  model-supplied parameter, since the model influences the renderer and a
  model-named root would make the whole grant model meaningless.
- Header popover lists a chat's folders with add/remove/make-primary, marks
  inherited ones.

## Permission broker (the safety floor everything else depends on)

`disabled_tools` was a global on/off switch and nothing else — with `fs_delete`
and `terminal_run` enabled, the model could delete anything or run any shell
command with zero confirmation.

- **`permissions.js`** — tools classified `read | write | destructive`. Reads
  pass straight through; anything above that **fails closed**: no approval UI
  installed, or the UI throws, and the call is denied. Deny always beats allow.
  No "always allow" offered for destructive calls.
- Rules layer chat → project → global, same shape as the folder bindings.
- Approval card shows the **actual diff** for a write (`diffPreview.js`, pure
  LCS diff, context-trimmed and capped) — approving "write src/app.js" tells
  you nothing; approving a visible patch does.
- Verified end-to-end, not just unit-tested: a test proves `executeTool('terminal_run', {command:'rm -rf /'})` is blocked with no UI installed.

## Undo journal

Every `fs_write` / `fs_edit` / `fs_delete` / `fs_move` snapshots the prior state
(files and whole directory trees) to `userData/yogatik-journal` before touching
disk. New `fs_undo` tool lists recent changes and restores one. Pruned by age
(14d) and size (200MB). Recording never throws — journalling must not block an
operation the user already approved.

## Search fix

`fs_search` used to walk up to 20,000 entries and read *every file* as UTF-8 —
no `.gitignore`, no binary detection, no size cap. On a repo with
`node_modules` this read hundreds of MB into strings. Now prunes `.git`/
`node_modules`/etc. and anything `.gitignore` excludes *before* touching disk,
skips binaries by NUL-byte sniff, caps files at 2MB. Measured: 4 files visited
instead of 400+, 9ms, on a synthetic tree.

## Dev-loop tools

Git (`git_status`/`log`/`diff` via the system binary, argument array only,
read-only subcommands enforced), background processes (`proc_start`/`output`/
`stop` — `terminal_run` was fire-and-wait with a 30s cap, so a dev server was
impossible), file watching (`fs.watch`, no new dependency), stdio MCP transport
(most published MCP servers are npx-launched stdio, and the app could only
reach HTTP ones), hooks (config + trust model — **deliberately inert** until a
trust UI exists, since a hooks file arrives inside a repo and cloning one must
never be enough to run commands), repo-defined commands
(`.yogatik/commands/*.md` merge into skills at read time), context compaction
(long conversations were truncated with an ellipsis; now summarized), a
per-chat task list, and sub-agent workspace isolation (opt-in; an isolated
agent can't call `fs_add_folder`, since that would defeat the isolation).

## Finance & quant suite (all pure, on-device, no API key)

Independent implementation — inspired by a public terminal app's feature list,
but **no code taken from it**: that project is AGPL-3.0, and the source here
is proprietary/unlicensed, so copying would force a licence change including
network disclosure. Every formula is written from the published equations
(Black-Scholes 1973, Merton 1973, Markowitz 1952), which aren't copyrightable.

- **`finance.js`** — DCF (Gordon terminal value; refuses when `g ≥ r` rather
  than returning a confident Infinity), NPV, IRR (bisection, can't diverge),
  CAGR, Sharpe/Sortino (`null`, not `Infinity`, when there's no variation),
  max drawdown, historical VaR, expected shortfall.
- **`options.js`** — Black-Scholes-Merton, full Greeks (also in trader units:
  per 1% vol, per day, per 1% rate — raw values are routinely misread by
  100×/365×), implied vol by bisection (Newton diverges when vega collapses
  deep ITM/OTM), a CRR binomial tree for American exercise. Validated against
  the canonical reference case: call 10.4506, put 5.5735, ATM delta 0.6368,
  put-call parity to 1e-6.
- **`portfolio.js`** — covariance/correlation, Gauss-Jordan inverse,
  min-variance and tangency (max-Sharpe) weights, risk parity, efficient
  frontier, beta. Weights unconstrained unless `long_only` is asked for.
- **`indicators.js` + `backtest.js`** — SMA/EMA/RSI(Wilder)/MACD/Bollinger/ATR/
  stochastic, all aligned to the input with `null` during warm-up. Backtester's
  entire point is the **one-bar delay**: a signal from bar *i*'s close can only
  be traded from bar *i+1* — same-bar execution is lookahead bias, the main
  reason a backtest looks great and loses money live. A test asserts a
  final-bar signal yields exactly zero return.
- **`marketData.js`** — keyless price history. Stooq was demoted to fallback
  after it was measured serving an HTML browser check to datacenter/VPN
  connections in the wild; **Yahoo Finance is now primary**, verified live.
  World Bank for economic indicators. Coinbase's candle tuple
  `[time, low, high, open, close, volume]` is *not* intuitive OHLC — pinned by
  a test after nearly getting it backwards.
- Exposed as `finance_analytics` and `market_data` tools, granted to the
  agents whose role actually needs them (15 presets regranted — `agent_finance`
  existed but couldn't call `finance_analytics` until this pass).

## Video

- **Root cause of "cannot generate videos"**: the MP4 muxer was fetched from a
  CDN *at render time* and wasn't a dependency at all. Offline (the user's own
  diagnostics showed `onLine:false`), the import failed and rendering broke.
  `mp4-muxer` is now a real, lazily-imported dependency — ships as a 31KB chunk
  inside the app, works offline. CDN kept only as a fallback.
- Quality presets (`draft`/`standard`/`high`/`max`) threaded into the encoder;
  previously hardcoded to a single bitrate curve.
- **`video/edit.js`** — pure trim/concat/speed planning (timecode parsing,
  clamped trims, `segmentAtFrame`, speed changes that *report*
  `audioNeedsResample` instead of silently producing chipmunk audio).
- **`video/decode.js` + `video_edit` tool** — real editing of an *existing*
  video (previously impossible — nothing could open a file). Seeks an
  off-screen `<video>` and repaints into the existing encoder; deliberately not
  WebCodecs `VideoDecoder`, which would need an MP4 demuxer as a new
  dependency. States its limits up front rather than on discovery: **no
  audio** (the source track isn't decoded), seek accuracy depends on
  keyframes, runs at seek speed.

## Concurrency

"Never more than 3 agents at once" was never a pool limit — proved with tests
running 10 and 16 concurrently (the documented ceiling; `agentPool.js` is
auto-concurrency, one slot per task). The 3 came from the model, because the
delegation prompt said *when* to spawn sub-agents but never *how many*. Prompt
now says explicitly: size the batch to the work, repeating the same specialist
is normal.

## Open web access (desktop)

CORS was stripped for a 10-host provider allowlist only, so every other page
read bounced through public relays (rate-limited, content-rewriting, or
markdown-only). Desktop now gets permissive CORS for **all** hosts and
`proxyFetch` tries direct first, relays only as fallback.

Safety: general web reads go **anonymous** — cookies stripped, `Origin`
removed, normal browser UA — because a blanket CORS bypass makes every
cross-origin response readable by the renderer, which model output
influences. A test written for that exact boundary caught a real hole
introduced in the same change: `[^/]*\.?firebaseapp\.com` also matched
`notfirebaseapp.com`, which would have sent session cookies to a lookalike
domain. Fixed to `(?:[^/]*\.)?`.

## Bug fixes surfaced by real diagnostics

- **Stuck-model bug**: `isRetiredModelError` matched a 404 only when the
  message said "not found" — but the message the app itself emits says "does
  not serve … (404)". A retired model was never pruned, so the dead selection
  stuck and every send failed until the user changed model by hand.
- **Misleading Ollama error**: "No provider with a working key could answer"
  for a provider that needs no key. Message now names keyless providers and
  says to start the service.
- **Misaligned chat bubbles**: `.message.user` had `margin-left: 60px`
  overriding the shared `margin: 0 auto` centring.

## Web app, PWA and multi-platform desktop shipping

- Service worker cache bumped (was unchanged across the whole session, which
  would have left stale precached shells for returning visitors).
- `api.js` no longer statically imports the agent/tool graph — deferred until
  a message is actually sent (measured: didn't shrink the bundle on its own,
  because two other files still import it eagerly; reported honestly rather
  than claimed as a win).
- Mobile: no horizontal body drift, 16px inputs (stops iOS zoom-on-focus),
  44px touch targets, `prefers-reduced-motion` honoured.
- Blank tray icon fixed — pointed at a `src-tauri/icons/` path that doesn't
  exist and was never shipped by `build.files` anyway. Added `public/favicon.ico`.
- Duplicate "Default" in onboarding — a hardcoded entry collided with an
  identically-named template.
- **Desktop now builds for Windows, macOS and Linux** via a CI matrix (macOS
  installers cannot be cross-compiled from Windows — a real macOS runner is
  required). Artifact names pinned (`Yogatik-Setup.exe`, `Yogatik.dmg`,
  `Yogatik.AppImage`, `Yogatik.deb`) so `/platforms` links resolve.
- **Source repo is private**, so GitHub release assets there are not publicly
  downloadable. Binaries now publish to a separate **public mirror repo**
  (`applicationmanifester/Yogatik-releases`) via a scoped `RELEASE_TOKEN` PAT
  (Contents: read-write on the mirror only) — source stays private, downloads
  stay free and unmetered. Workflow degrades gracefully without the secret:
  still builds and uploads artifacts to the run, emits an explicit
  `::warning::` naming what to add, never fails opaquely.
- Cross-surface links added: desktop app points *out* to the web app (for
  phones/tablets, which have no desktop build); the web app points *in* to
  `/platforms`.

## Process notes

- **170 uncommitted files rescued** early in the session — work that existed
  only in the working tree with no commit, no branch, no backup. Two files
  literally named `nul` (a Windows-reserved device name) had been silently
  breaking every `git add -A` since Aug 11, which is almost certainly why the
  backlog had grown that large.
- **A 178MB build artifact** got swept into a commit by that rescue
  (`terminal/dist-electron-fresh/win-unpacked/Yogatik`), which GitHub's
  100MB limit then rejected on push. Purged from the *unpushed* history with
  `git filter-branch` (explicit user permission obtained first; a backup ref
  `backup-before-purge` was kept). Build-output directories are now
  gitignored so this can't recur.
- Duplicate implementations from two parallel lines of work (this session's
  and an earlier uncommitted line) were merged by **keeping both** where they
  served different purposes (a task-manager `processes.cjs` alongside a
  command-runner `bgProcesses.cjs`; two MCP transports; two file watchers)
  rather than picking a winner and discarding functionality.

## Verification discipline used throughout

- Every new module has unit tests written *before* the implementation, run to
  fail, then made to pass (TDD).
- Claims about live systems were checked, not assumed: endpoints tested with
  real HTTP calls before being wired into tools (Coinbase confirmed working,
  Stooq confirmed serving a bot-check, World Bank confirmed timing out from
  this network), the CORS security boundary was tested and caught its own bug,
  the release mirror's write access was confirmed by an actual push.
- Where a fix didn't achieve its goal (the `api.js` lazy-import not shrinking
  the bundle), that was reported plainly rather than presented as a win.

---

## Open follow-ups

- **`RELEASE_TOKEN` secret** still needs adding to the private source repo
  (Settings → Secrets → Actions) for the desktop-release workflow to actually
  publish to the public mirror — without it, builds succeed but stay
  attached to the Actions run instead of appearing on `/platforms`.
- **Hooks execution** is wired but inert until a trust UI ships (by design —
  see Dev-loop tools above).
- **`api.js`'s static import of the agent/tool graph** is not fully resolved;
  `live/session.js` and one other module still pull it in eagerly, so the
  startup-bundle win is not yet realised.
- Code-signing certificates are not in place for any platform — builds are
  unsigned (Gatekeeper/SmartScreen will warn on first run).
