# Yogatik 3.10.2 — release summary

**Date:** 2026-08-18
**Version:** 3.9.3 → **3.10.2** (minor: new capability, not just fixes)
**Range:** `17242f1..HEAD` · 32 commits · 42 files · +5336 / −260
**Tests:** 1189 passing (92 files) · lint 0 errors
**Status:** pushed · **web deployed and verified live** · tagged `v3.10.2`

---

## Headline: the desktop app can now use a real browser

Yogatik could *fetch* web pages but could not *use* one — no logging in, no
clicking, no filling forms, no seeing what a page rendered after its JavaScript
ran.

That is a hard wall in the browser build, not an oversight. Driving an external
site from inside a page means iframing it, and cross-origin iframes are refused
by `X-Frame-Options`/`frame-ancestors` on most real sites and are opaque to the
parent even when allowed. There is no web API to screenshot another origin or
click inside it.

Electron's `WebContentsView` is a real top-level browsing context, so the desktop
app can. One tool, `browser_control`, drives real tabs the user can watch — in a
dedicated window **or** docked in-app.

### Design decisions worth remembering

**Refs, not pixels.** `read` returns the page as a tree where every interactive
element carries a `[ref_N]` handle. The model names *what* it wants; the code
computes *where*. A coordinate miss is silent — it clicks the wrong thing and the
agent proceeds as if it worked.

**Stale refs fail loudly.** Refs are epoch-tagged; the epoch bumps on navigation
and on every read. A superseded ref returns `{stale: true}` and is **never**
downgraded to a coordinate click.

**Refs are numbered before truncation**, so a ref printed in the visible slice
still resolves to the element the page registered.

**The ref map lives in the page.** `window.__yogatikRefs__` holds live element
references; main stores only the epoch and re-measures at action time. An element
that moved but still exists is still clicked correctly.

**One set of views, two surfaces.** `setMode` re-parents; it never rebuilds, so
tabs, cookies, history and refs survive a switch.

**Sessions die with the chat** — an authenticated tab must not follow the user
into an unrelated conversation.

### Two crashes caught by real-Electron verification

Neither was reachable by unit tests, because vitest runs under jsdom.

1. **A native, uncatchable crash.** `setMode` destroyed the `BrowserWindow` while
   its `WebContentsView`s were alive; closing one afterwards killed the process —
   not a JS throw, so no `try/catch` would have helped. Both `setMode` and the
   last-tab path now **hide** the window; `destroySession` is the only place it is
   destroyed, and it closes every view first.
2. **A paint race.** `capturePage` failed with `UnknownVizError` on a cold
   capture. `screenshot` now shows the surface, waits, and retries once.

The throwaway harness that found them is now in the repo as `npm run test:browser`
(28 checks) — it asserts a click by ref *actually fires the page's handler*, typed
text lands in the real input, and a stale ref is refused.

---

## Agent reliability

**Empty replies (`"The model returned an empty response"`).** The tool loop had a
guard for the cap-hit case but none for "loop ended with nothing visible", so a
model that fell silent after tool results ended the turn blank and threw the
tool's work away. It now asks once for a plain-prose answer, then surfaces the
gathered tool results rather than a blank bubble. The retry shares the cap-hit
path's forced pass, so a model that only ever emits tool calls still costs at most
initial + 8 rounds + 1.

**"I have no shell/terminal access."** The assistant refused real work on the
desktop build while holding `terminal_run`, `proc_start`, `fs_*`,
`browser_control` and `computer_control`. It was not malfunctioning: the system
prompt opened with *"access to powerful browser-native tools"* on every surface,
and `agent.js` never consulted `isDesktop`. It believed what it was told.
`buildSystemPrompt` now states the runtime — desktop says it has a real shell,
filesystem and browser and must never claim otherwise; web says desktop-only
tools will refuse, so say so plainly.

**Tool selection.** `code_execute` never said what it *cannot* do, so the model
reached for the Pyodide sandbox when it needed the real machine. It now names
`terminal_run` / `proc_start` / `fs_read` instead. `terminal_run` never mentioned
that it waits and times out at 30s — which is why `npm run dev` under it looked
broken rather than simply being the wrong tool.

**`browser_autopilot` was overclaiming.** It describes itself as navigating pages
"like Strawberry Browser" but is `proxyFetch` plus regex tag-stripping — a
`web_extract` duplicate that cannot run JavaScript, log in, or click. Left alone
the model would keep choosing the fake browser over the real one. Description
corrected; not deleted, since the web build still needs static extraction.

**Repeated tool calls.** Seen twice in the field: `video_render` called ten
times in one turn, `web_search` nine times with identical arguments. The round
cap bounded the damage but nothing stopped the repetition itself, so a failing
tool was retried until the budget ran out. Calls are now keyed by name plus
arguments (key order normalised), and a repeat is answered from the first
call's result with a note telling the model to use it, change the arguments
materially, or answer. This matters most for the failing case — re-running a
call that just failed cannot produce a different answer.

**Static extraction gave up on renderable pages.** Asked to read a JavaScript
SPA, the assistant reported the content unreadable and stopped. Correct about
`web_extract`, which only ever sees static HTML — but a dead end, because on
desktop `browser_control` renders that page fine. The empty-result branch now
carries the next step in the *result* (the trick `youtube`'s `transcript_note`
already uses), and names `browser_control` only when the bridge is actually
present, so the web build is never promised a tool that will refuse.

**Video renders that produced nothing.** `video_render` was called ten times in
one turn with steadily worse arguments — `elements[]`, then `[]`, then `[{}]` —
before telling the user to run ffmpeg locally. A scene with no `type` defaulted to
an empty "text" scene: it drew nothing, reported success, and taught a guessing
model nothing. `normalizeSpec` now rejects a scene carrying neither a type nor any
content, names the invented field back, and shows a worked example.

---

## New: live reasoning + actions panel

The data already existed — the per-message *"Steps, thoughts & actions taken"*
disclosure and the `<think>` panel — but only *after* the turn, collapsed, one
message at a time. There is now a docked panel (header **Activity** icon) showing
tools as they start with running timers and results, and reasoning as it streams.

`activityStream.js` is an imperative DOM-free pub/sub. It is deliberately **not**
React state in App: routing streaming tokens through App state re-renders the
whole shell every frame, which is the bug `StreamingMessage.jsx` exists to avoid.
Notifications coalesce to one animation frame — pinned by a test asserting three
publishes yield one notification.

Extracting the shared `splitReasoning` into `reasoning.js` exposed a real bug: an
**unclosed `<think>` was discarded** rather than captured, so reasoning stayed
invisible until `</think>` arrived. Now captured as it streams, which also
improves the existing inline Thinking panel.

The inline disclosure is untouched, so nothing regresses when the panel is shut.

---

## UI and infrastructure

**Sign In was invisible.** Not hidden — *clipped*. `.sidebar` is
`overflow: hidden`, and `.settings.open` held a fixed `58vh` via a `flex-shrink:0`
rule meant for the closed toggle. On a short window that plus the fixed chrome
exceeded the sidebar, `.sidebar-scroll` collapsed to 0, and the footer's last
child fell outside the hidden overflow with no scrollbar to reach it. `58vh` is
now a cap rather than a floor. Measured: the button sat 44px below the edge at
560px height; it now ends 18px above it and still fits at 460px.

**The activity panel covered the chat it described.** At 42% wide and
`position: absolute` it sat on top of the conversation, so reading the answer
while watching the tools was impossible — the whole point of having both. It is
now a flex sibling of `.chat-area` rather than an overlay, at a 300px rail, so
the chat narrows instead of being hidden. Measured at 1280px: panel 538px →
300px, overlap gone, sidebar + chat + panel now sum exactly to the viewport.
Below 768px it reverts to a full-width overlay.

**`/platforms` downloaded the installer before anyone asked.** Opening the page
fetched a 114MB `.exe` on its own, 800ms after load, with no click — a drive-by
download the visitor never consented to, and one browsers and AV treat as
hostile. It also repeated: the once-per-browser guard was *cleared by clicking
the download button*, so anyone who downloaded deliberately got another
automatic copy on every later visit. Removed entirely; the buttons now need a
real click.

**Auto-update never worked in production.** `electron-updater` was a
`devDependency`, and electron-builder never packages those — so
`require('electron-updater')` threw in every shipped build and the guard in
`updater.cjs` swallowed it silently. Verified by parsing the built `app.asar`
before and after. **3.10.2 is the first published build whose updater is actually
packaged** (3.10.0 was built but never released), so users on 3.9.x must install
manually; auto-update starts working from 3.10.2 onward.

**CI's `e2e` job had failed on every run since it was added.** It installed a
Playwright browser then ran `npm run e2e` — a script that did not exist, alongside
no `@playwright/test`, no config and no specs. Now filled in: four smoke tests
against the **production bundle**, covering what the jsdom suite structurally
cannot (a broken build output, a 404ing chunk, a browser-only crash). Console
assertions filter the noise a keyless CI browser always emits so it does not
become a flake generator.

**Folders popover could not be dismissed** — a `role="dialog"` with no close
button, no Escape and no outside-click. All three added, listeners bound only
while open.

Also: `Use on phone or tablet` → `Use web app on mobile/tab`; the browser test
harness is excluded from the installer.

---

## Verification

| Check | Result |
|---|---|
| `npm test` | **1189 passed / 92 files** |
| `npm run lint` | **0 errors** (88 pre-existing warnings) |
| `npm run e2e` | 4/4 against the production bundle |
| `npm run test:browser` | 28/28 in a real Electron app |
| Web + Electron renderer builds | ✅ |
| Installer | signed, blockmap + `latest.yml` (CI rebuilds at 3.10.2) |
| Live web app | serving the built bundle; fixes confirmed by fetching it |

---

## Shipped

**Web app is live.** Deployed after the lint/test gates, serving the bundle built
from this work. Verified by fetching the live files rather than trusting the
deploy output: the duplicate-call breaker, the runtime block, the `web_extract`
escalation and the corrected tool descriptions are all present, and
`startWinDownload` on `/platforms` went **3 → 0** — the drive-by download is gone
from production.

Hosting only, deliberately: `deploy.bat` also pushes `firestore:rules`, but no
security rules changed here and publishing them is a separate, riskier action.

**Tagged `v3.10.2`.** An earlier `v3.10.1` tag was refused by CI because the
branch built `3.10.0` — the version guard doing exactly its job, since an
installer labelled one version while reporting another would hand the updater the
wrong number. Rather than force it through, `package.json` and the tag were made
to agree at 3.10.2. CI builds and publishes into `Yogatik-releases` from there.

---

## Open items

**1. Watch the CI release run.** The macOS and Linux jobs were also failing on the
earlier attempt. The version-mismatch step is fixed; if those two fail for other
reasons it is a separate problem and needs their logs.

**2. 3.9.x users must install manually.** Their copy carries the updater that was
never packaged, so it cannot fetch this release. Auto-update works from 3.10.2
onward.

**3. The local installer is stale** (built at 3.10.0). CI produces the real
release artefacts — do not distribute the local `.exe`.

**4. Desktop UI not driven by hand.** The browser panel's occlusion behaviour and
the renamed footer link were verified by measurement and by reading source, not by
using the packaged app. Worth a pass.

**5. Two bridges are still dead**, as `CLAUDE.md` records:
`__YOGATIK_CLIPBOARD__.onSelectionHotkey` — the global Ctrl+Alt+C hotkey fires and
main relays it, but nothing in the renderer listens — and
`__YOGATIK_DND__.getPathForFile`, so a file dropped on the desktop window still
yields an opaque blob. Both are features users cannot reach today.

---

## Recommended next

From reviewing an external feature analysis: roughly 60% of its "future roadmap"
already ships (computer use, cron, command palette, local FS sync, share target,
memory dashboard, workflows, WebLLM, forkable plugin bundles). The genuinely
missing, highest-value item is **pre-flight token estimation with hard budget
caps** — the usage meter is post-hoc and estimated at ~4 chars/token, so BYOK
users discover cost only after spending it. Self-contained, no backend.

Two suggestions should be actively **rejected**: a user PIN for local key storage
(already considered and rejected — *"a passphrase nobody remembers protects a key
nobody can use"*; desktop already uses the OS keychain), and a community registry
of executable JS/Python tools (breaks `plugins.js`'s central property that no
arbitrary code runs, in an app holding users' API keys).

---

## Design docs

- `docs/superpowers/specs/2026-08-18-desktop-browser-control-design.md`
- `docs/superpowers/plans/2026-08-18-desktop-browser-control.md`
