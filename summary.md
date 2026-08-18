# Real browser control for the Yogatik desktop app (v3.16)

**Date:** 2026-08-18
**Branch:** `feat/desktop-browser-control` → merged to `main` (`3b17be1`)
**Commits:** 12 + merge commit · 19 files · +1555 / −6

---

## Why this exists

Yogatik could *fetch* web pages but could not *use* one. It could not log in,
click a button, fill a form, scroll a feed, or see what a page rendered after
its JavaScript ran.

That is a hard wall in the browser build, not a missing feature. Driving an
arbitrary external site from inside a page means iframing it, and cross-origin
iframes are refused outright by `X-Frame-Options` / `frame-ancestors` on most
real sites — and are opaque to the parent even when allowed. There is no web API
to screenshot another origin or click inside it.

The desktop shell has no such limit. Electron's `WebContentsView` is a real
top-level browsing context. This ships that capability.

---

## What was built

One tool, `browser_control`, driving real `WebContentsView` tabs the user can
watch.

| Area | Behaviour |
|---|---|
| **Surfaces** | A dedicated browser window with a tab strip, **or** a panel docked in the app. Both host the *same* views. |
| **Targeting** | `read` returns the page as a tree where every interactive element carries a `[ref_N]` handle. Clicks and typing address elements by ref. |
| **Tabs** | Open, list, select, close; pop-ups become real tabs. |
| **Session scope** | Keyed by conversation; destroyed on chat switch. |
| **Web build** | Honest `"Browser control runs only in the Yogatik desktop app."` |

### Actions

`navigate` · `read` · `click` / `double_click` / `right_click` · `type` · `key` ·
`scroll` · `screenshot` · `new_tab` · `list_tabs` · `select_tab` · `close_tab` ·
`back` / `forward` · `set_mode` · `close`

---

## Design decisions worth remembering

**Refs, not pixels.** `computer_control` is coordinate-only because it drives
*other* applications, where there is no way in. Inside our own view we can run
JavaScript, so the model names *what* it wants and the code computes *where*. A
coordinate miss is silent — it clicks the wrong thing and the agent proceeds as
if it worked.

**Stale refs fail loudly.** A ref is meaningless once the page navigates or
re-renders. Refs are epoch-tagged (`ref_<epoch>_<n>`), the epoch bumps on
main-frame navigation and on every read, and a superseded ref returns
`{stale: true}`. It is **never** downgraded to a coordinate click — that is the
exact failure the tree exists to prevent.

**Refs are numbered before truncation.** A ref printed in the visible slice must
resolve to the element the page registered, so the page registers every
interactive node it saw, not just the ones printed.

**The ref map lives in the page.** `window.__yogatikRefs__` holds live element
references; main stores only the epoch and re-measures at action time. Main never
holds a stale DOM handle, and an element that moved but still exists is still
clicked correctly.

**One set of views, two surfaces.** `setMode` re-parents; it never rebuilds. Tabs,
cookies, history and refs survive a switch.

**Sessions die with the chat.** A browsing session carries logged-in state. An
authenticated tab must not follow the user into an unrelated conversation.

**Pure/glue split.** `browserTree.cjs` requires no Electron, so vitest reaches it
under jsdom — the same split as `rootsCore.cjs` / `roots.cjs`, and the only reason
the interesting logic is testable at all.

---

## Two crashes caught by real-Electron verification

Neither was reachable by a unit test, because vitest runs under jsdom and
`WebContentsView` needs a real Electron app.

**1. A native, uncatchable crash.** `setMode` destroyed the `BrowserWindow` while
its `WebContentsView`s were still alive. Closing one of those orphaned views
afterwards killed the process — not a JS throw, so no `try/catch` would have
helped. Both `setMode` and the last-tab path now **hide** the window;
`destroySession` is the only place it is destroyed, and it closes every view
first.

**2. A paint race.** `capturePage` failed with `UnknownVizError` on a cold capture
right after the surface was created. `screenshot` now shows the surface, waits,
and retries once.

---

## A correction shipped alongside

`browser_autopilot` described itself as an *"Autonomous browser worker that
navigates to a URL… (like Strawberry Browser)"*. It is actually `proxyFetch` plus
regex tag-stripping — a `web_extract` duplicate that cannot run JavaScript, log
in, or click anything.

Left alone, the model would have kept choosing the fake browser over the real one.
Its description now says plainly what it does. It was **not** deleted — the web
build still needs static extraction. The new `browse` / `open_url` / `web_browse`
aliases point at `browser_control`, never at it.

---

## Files

| File | Role |
|---|---|
| `frontend/electron/browserTree.cjs` | **Pure.** Walker + resolver sources, simplification, ref assignment, truncation, staleness. No `require('electron')`. |
| `frontend/electron/browserControl.cjs` | Sessions, tabs, both surfaces, IPC, teardown. |
| `frontend/electron/browserWindow.html` | Tab strip for window mode. |
| `frontend/electron/browserWindowPreload.cjs` | One-channel preload so the tab buttons work. |
| `frontend/electron/browserHarness/` | Real-Electron integration harness (`npm run test:browser`). |
| `frontend/src/tools/browserControl.js` | The `browser_control` tool. |
| `frontend/src/components/BrowserPanel.jsx` | Panel chrome + bounds reporting. |
| `frontend/src/tools/browserTree.test.js` | 25 unit tests. |

Modified: `main.cjs`, `preload.cjs`, `tools/index.js`, `App.jsx`,
`PersonalisePanel.jsx`, `agents.js`, `styles.css`, `package.json`, `CLAUDE.md`.

---

## The layering gotcha (read before touching the panel)

A `WebContentsView` is composited **above** the renderer's DOM. `z-index` does not
apply to it and React markup cannot occlude it.

So `BrowserPanel.jsx` is *chrome around a hole*: it reports its content rect and
main positions the native view to match. Any overlay that should cover the panel
would otherwise be painted **underneath** it — hence `browserOccluded` in
`App.jsx`, which detaches the view while a modal is open. `settingsOpen` matters
most, since that drawer docks exactly where the panel does.

Renderer-supplied *bounds* are safe (a rectangle escapes nothing) and are **not**
an exception to the rule that the renderer never names a filesystem root.

---

## Verification

| Check | Result |
|---|---|
| `npm test` | **1152 passed / 89 files** |
| `npm run lint` | **0 errors** (88 pre-existing warnings) |
| `npm run build` (web) | ✅ |
| `npm run build:electron` | ✅ |
| `npm run test:browser` | **28/28** in a real Electron app |

The harness asserts what mocks cannot: that a click by ref **actually fires the
page's handler**, that typed text lands in the real input, and that a stale ref is
refused rather than clicking blind.

---

## Not done

**The running app has not been driven by hand.** The code paths are covered by the
harness, but nobody has launched the desktop app and browsed with it. Worth doing
before shipping, specifically:

- Ask the agent to open a site and read it → separate window with a tab strip.
- Search on a real site by ref → text lands, results load.
- Switch **Browser surface** to *A panel in the app*, then open the settings
  drawer over it → the native view should detach, not be painted under.
- Open two tabs, switch chats → the browser should close entirely.

Panel occlusion in particular depends on real layout that cannot be asserted
headlessly.

**Also out of scope** (deliberate): downloads through the agent's browser, cookie
persistence across restarts beyond Electron's default, extensions/CDP, recording
browsing as a replayable workflow, mobile emulation, and any hard technical
guardrail on risky actions — safety is prompt-level, matching `computer_control`.

---

## Design docs

- Spec: `docs/superpowers/specs/2026-08-18-desktop-browser-control-design.md`
- Plan: `docs/superpowers/plans/2026-08-18-desktop-browser-control.md`
