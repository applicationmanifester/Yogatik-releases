# Desktop browser control (Yogatik desktop)

**Date:** 2026-08-18
**Status:** Approved, ready for implementation planning
**Scope:** One spec. Desktop (Electron) only; the web build gets an honest refusal.

## Problem

Yogatik can *fetch* web pages (`web_extract`, `web_search`, `deep_research` — all
`proxyFetch` + HTML parsing) but it cannot *use* one. It cannot log in, click a
button, fill a form, scroll a feed, or look at what a page actually rendered after
its JavaScript ran.

This is a hard wall in the browser build, not a missing feature. To drive an
arbitrary external site from inside a page you would have to iframe it, and
cross-origin iframes are refused outright by `X-Frame-Options`/`frame-ancestors`
on most real sites and are opaque to the parent's JS even when allowed. There is no
web API for "screenshot another origin" or "click inside another origin".

The desktop shell has no such limit. Electron's `WebContentsView` is a real
top-level browsing context: `loadURL` anywhere, `executeJavaScript` to read the DOM,
`sendInputEvent` for synthetic clicks and typing, `capturePage` for screenshots.
This is exactly the capability set Claude Code's own Browser pane exposes, and it is
the same class of "web-impossible capability" as the rest of the v3.13 Desktop
Superpowers batch.

## Goal

The agent can open web pages in a browser the user can watch, read their structure,
and interact with them — click, type, scroll, navigate, manage tabs — as a normal
registered tool, on both a dedicated OS window and an in-app docked panel.

## Design decisions

Settled during brainstorming; not open questions.

| Decision | Choice |
|---|---|
| Visibility | Visible and watchable — never headless |
| Surfaces | **Both** a separate window and an in-app docked panel |
| Choosing the surface | User sets a default; the model may override per call |
| Targeting elements | Full accessibility tree with `ref_N` handles |
| Coordinate clicking | Kept as a fallback for canvas/custom widgets |
| Tabs | Multiple, agent-managed |
| Session lifetime | Scoped to the conversation; torn down on chat switch |
| Safety | Prompt-level guidance only, matching `computer_control` |
| Tool shape | One `browser_control` tool with an `action` enum |

### Why both surfaces, and why they share one view

A separate window is the honest default: browsing is a big visual task, it wants
room, and the user can take the wheel themselves mid-session. But a docked panel
keeps a quick lookup next to the conversation that prompted it, the way
`ArtifactPanel` already does for generated code.

The two modes are **not** two implementations. Both host the *same*
`WebContentsView` objects; switching mode re-parents the view and re-sets its
bounds. Session state — tabs, history, cookies, refs — is untouched by a mode
switch. Building them as separate stacks would double the tab logic and guarantee
they drift.

### Why the accessibility tree instead of coordinates

`computer_control` is coordinate-only because it drives *other applications*, where
we have no way in. Inside our own `WebContentsView` we can run JavaScript, so we can
do better — and should. Models are reliably a few pixels off on small buttons, and a
coordinate miss is silent: it clicks the wrong thing and the agent proceeds as if it
worked.

A `read` walks the page, emits a simplified role/label/text tree, and tags every
interactive node `ref_N`. `click`/`type` take a ref, resolve it to the element's real
`getBoundingClientRect()` centre at action time, and fire the input event there. The
model names *what* it wants; the code computes *where*.

Coordinate clicking stays available for canvas apps, `<video>` scrubbers and custom
widgets the tree cannot describe.

### Why refs must go stale loudly

A `ref_N` is meaningless once the page navigates or re-renders. Reusing a stale ref
would resolve to whatever now sits at that index — a wrong click that looks like a
successful one, which is the exact failure mode the tree was introduced to remove.

Every session tracks a `refEpoch` per tab, bumped on navigation and on each fresh
`read`. Refs are issued as `ref_<epoch>_<n>` internally. An action naming a ref from
a superseded epoch returns an explicit
`{ success:false, error:'stale ref — call read again', stale:true }`.
It never falls back to a coordinate.

The ref → element mapping lives **in the page**, not in main: the injected walker
keeps a `window.__yogatikRefs__` array of live element references for the current
epoch, and resolution runs as another `executeJavaScript` call that re-measures the
element at action time. Main stores only the epoch number. This keeps main free of
stale DOM handles and means a moved-but-still-present element is still clicked
correctly.

### Why the session dies with the chat

A browsing session carries logged-in state. Chat A's authenticated GitHub tab
appearing in chat B is both surprising and a genuine leak between contexts that the
per-chat working-folder model (v3.9) already establishes as the app's boundary. The
session is keyed by `conversationId` and torn down — window/panel closed, all tabs
destroyed — when the active conversation changes.

### Why prompt-level safety only

This matches `computer_control`, which can already click anything on the entire
screen, including inside the user's real browser. A hard guardrail on our own
in-app browser while the broader tool stays open would be security theatre, and
DOM-sniffing for "is this a password field" produces false positives on legitimate
inputs. The schema instructs: read before acting, and confirm with the user before
anything that submits, sends, deletes or purchases.

## Architecture

```
electron/browserTree.cjs      PURE — tree simplification, ref assignment, truncation
                              (no require('electron') — vitest reaches it under jsdom)
electron/browserControl.cjs   Sessions, tabs, both surfaces, IPC. Not unit-tested.
electron/browserWindow.html   Minimal tab strip for window mode. No React/Vite.
electron/preload.cjs          + __YOGATIK_BROWSER__ bridge
src/tools/browserControl.js   browser_control tool, gates on its own bridge
src/components/BrowserPanel.jsx  Panel-mode chrome + bounds reporting
src/tools/browserTree.test.js    Unit tests for the pure module
```

The `browserTree.cjs` / `browserControl.cjs` split follows `rootsCore.cjs` /
`roots.cjs` exactly, and for the same reason: vitest only collects `src/**/*.test.js`
under jsdom, where `require('electron')` throws. The split is what makes the
interesting logic testable at all.

### Session registry

```js
sessions: Map<conversationId, {
  mode: 'window' | 'panel',
  win: BrowserWindow | null,        // window mode only
  tabs: Map<tabId, {
    view: WebContentsView,
    refEpoch: number,
  }>,
  activeTabId: string,
}>
```

One session per conversation, at most one alive at a time (a chat switch tears the
previous one down before creating the next).

### Panel mode and the layering gotcha

A `WebContentsView` is an OS-level layer composited **above** the renderer's DOM. It
cannot be occluded by React markup, and `z-index` does not apply to it.

So `BrowserPanel.jsx` is chrome around a hole. It renders the header, tab strip and
buttons, and reports the content area's bounds — `getBoundingClientRect()` scaled by
`devicePixelRatio` — to main via `setBounds`. Main positions the view to match.
Bounds are re-reported on window resize, panel resize and mode switch.

Two consequences the implementation must handle:

- **Modals**: any overlay that would visually cover the panel (settings drawer,
  `AdModal`, command palette) would be painted *under* the browser view. The panel
  detaches the view (`removeChildView`) while such an overlay is open and re-attaches
  on close.
- **Bounds are authoritative from the renderer here.** This is safe — a bounding
  rectangle cannot escape a sandbox — and is *not* an exception to the rule that the
  renderer never supplies a filesystem root.

Panel mode reuses `.artifact-panel`'s right-docked geometry (absolute, 50% width,
360px min, full height) so it behaves like the Canvas users already know.

### Mode resolution

```
display param (per call, optional)
  └─ falls back to chat_prefs.browser_display_mode
       └─ falls back to 'window'
```

Passing `display` on a call with a live session **switches** that session's surface
rather than opening a second one. There is never more than one surface per session.

The user can always switch by hand: a dock button in window mode, a pop-out button in
the panel. A manual switch updates the stored default, so the user's last physical
choice wins on the next chat.

## Tool surface

One tool, `browser_control`, registered in `tools/index.js` with aliases
(`browse`, `open_url`, `browser`, `web_browse`, `click_element`, `read_page`).

| action | params | returns |
|---|---|---|
| `navigate` | `url`, `tabId?`, `display?` | final url, title, load status |
| `read` | `tabId?` | accessibility tree with fresh refs, url, title |
| `click` | `ref` \| `x`+`y`, `tabId?`, `button?`, `double?` | ok / stale |
| `type` | `text`, `ref?`, `submit?`, `tabId?` | ok / stale |
| `key` | `keys`, `tabId?` | ok |
| `scroll` | `amount?`, `direction?`, `ref?`, `tabId?` | ok |
| `screenshot` | `tabId?` | `image` (data URL) |
| `new_tab` | `url?` | `tabId` |
| `list_tabs` | — | tabs with `tabId`, url, title, active flag |
| `select_tab` | `tabId` | ok |
| `close_tab` | `tabId` | ok |
| `back` / `forward` | `tabId?` | url |
| `set_mode` | `display` | mode |

`tabId` defaults to the session's active tab throughout, so the common
single-page flow never mentions tabs.

`screenshot` returns a data URL. The agent's existing image policy applies unchanged
— `stripImage()` before stringify, `pruneOldImages()` keeping one frame — so a
long browsing session does not fill the context with stale screenshots.

### Reading a page

`read` injects a walker that emits, per node: role, accessible name, visible text
(truncated), and `ref` for interactive elements. Non-interactive containers with no
text are collapsed away. Output is capped at a node budget with an explicit
`truncated: true` and a note, mirroring how `read_page` behaves elsewhere in this
app's tooling — a 50k-node page must not blow the context window.

The walker prefers the accessibility tree's semantics but is a DOM walk, not
`webContents.debugger`/CDP: the DOM walk is synchronous, simpler to reason about, and
does not require attaching a debugger session that would conflict with devtools.

### Web fallback

No `__YOGATIK_BROWSER__` bridge → every action returns
`{ success:false, error:'Browser control runs only in the Yogatik desktop app.' }`,
matching every other desktop-only tool. The tool stays registered and visible so the
model can explain the limitation rather than hallucinate around a missing tool.

## Agent integration

The **Desktop Operator** preset agent (`agents.js`) gains `browser_control` in its
tool list and a look-then-act line in its system prompt, parallel to the
`computer_control` wiring it already has.

## Error handling

| Case | Behaviour |
|---|---|
| Navigation fails (DNS, 4xx, cert) | `{success:false, error, url}` — the tab survives |
| Load exceeds 30s | Resolve with `timeout:true` and whatever loaded; do not hang the turn |
| Stale ref | `{success:false, stale:true}` with "call read again" |
| Ref resolves off-screen | Scroll it into view, then act |
| Tab crashes (`render-process-gone`) | Drop the tab from the registry, report it |
| Action with no session | Auto-create the session and open the surface |
| `close_tab` on the last tab | Close the surface; session stays, next call reopens |
| User closes the window/panel | Destroy the session; next call opens a fresh one |

Every handler returns the `{success, ...}` shape the existing tool cards and
`toolStatus.js` already interpret; no new failure convention.

## Testing

`src/tools/browserTree.test.js` covers the pure module:

- Simplification keeps interactive nodes, collapses empty containers
- Ref assignment is stable within an epoch and changes across epochs
- Stale-epoch refs are rejected, never coerced to a coordinate
- Node-budget truncation sets `truncated` and preserves the head of the tree
- Nodes with no accessible name fall back to text, then to role
- Deeply nested and cyclic-ish structures terminate

`src/tools/desktopCapabilities.test.js` gains web-fallback cases asserting
`browser_control` refuses honestly with no bridge.

The Electron glue in `browserControl.cjs` is not unit-tested, consistent with every
other `electron/*.cjs` module in this codebase. It is exercised by hand against a
real page during implementation.

## Out of scope

- Downloading files through the agent's browser
- Persisting cookies/sessions across app restarts (Electron's default session
  behaviour applies; no extra work either way)
- Extensions, devtools automation, CDP/`webContents.debugger`
- Recording/replaying browsing as a repeatable workflow
- Mobile/responsive emulation
- Any hard technical guardrail on risky actions (decided: prompt-level only)

## Documentation

`CLAUDE.md` gains a section under the Desktop Superpowers batch covering: the two
surfaces and the shared-view rule, the ref-staleness contract, the
`WebContentsView`-composites-above-DOM layering gotcha and the modal detach it
forces, and the per-conversation session lifetime.
