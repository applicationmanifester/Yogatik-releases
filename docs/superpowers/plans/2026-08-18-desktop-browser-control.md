# Desktop Browser Control Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the Yogatik desktop agent a real, watchable browser it can navigate, read and interact with — via one `browser_control` tool over Electron `WebContentsView` tabs, shown either in a dedicated window or docked in-app.

**Architecture:** A pure, testable module (`browserTree.cjs`) turns a flat list of DOM nodes into a ref-tagged accessibility tree; an Electron module (`browserControl.cjs`) owns per-conversation sessions of `WebContentsView` tabs and hosts them in either a separate `BrowserWindow` or docked inside the main window. A preload bridge exposes it, one renderer tool drives it, and a React panel supplies chrome + bounds for panel mode.

**Tech Stack:** Electron 43 (`WebContentsView`, `sendInputEvent`, `executeJavaScript`, `capturePage`), React 18, Vitest 4, CommonJS for `electron/*.cjs`.

**Spec:** `docs/superpowers/specs/2026-08-18-desktop-browser-control-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/electron/browserTree.cjs` | **Create.** Pure: in-page walker source, tree simplification, ref assignment, truncation, ref parsing/staleness. No `require('electron')`. |
| `frontend/electron/browserControl.cjs` | **Create.** Sessions, tabs, both surfaces, all IPC handlers, teardown. |
| `frontend/electron/browserWindow.html` | **Create.** Minimal tab strip for window mode. No React/Vite. |
| `frontend/electron/preload.cjs` | **Modify.** Add `__YOGATIK_BROWSER__` bridge. |
| `frontend/electron/main.cjs` | **Modify.** Register module; tear down on `will-quit`. |
| `frontend/src/tools/browserControl.js` | **Create.** `browser_control` tool; gates on its own bridge. |
| `frontend/src/tools/index.js` | **Modify.** Register tool + aliases; fix `browser_autopilot` description. |
| `frontend/src/components/BrowserPanel.jsx` | **Create.** Panel chrome, bounds reporting, pop-out. |
| `frontend/src/App.jsx` | **Modify.** Render panel, teardown on chat switch, mode pref. |
| `frontend/src/components/PersonalisePanel.jsx` | **Modify.** Default-surface control. |
| `frontend/src/agents.js` | **Modify.** Desktop Operator gains `browser_control`. |
| `frontend/src/styles.css` | **Modify.** `.browser-panel` geometry. |
| `frontend/src/tools/browserTree.test.js` | **Create.** Unit tests for the pure module. |
| `frontend/src/tools/desktopCapabilities.test.js` | **Modify.** Web-fallback cases. |
| `CLAUDE.md` | **Modify.** Document the subsystem + gotchas. |

**Note on an existing tool:** `browser_autopilot` (`src/tools/desktopCompanion.js:145`) claims to be an "Autonomous browser worker that navigates to a URL... (like Strawberry Browser)". It is actually `proxyFetch` + regex tag-stripping — it cannot run JavaScript, click, or see rendered content. Task 11 corrects its description so the model stops choosing it when it needs a real browser. It is **not** deleted: the web build still needs static extraction.

---

## Task 1: Pure tree module — node classification

**Files:**
- Create: `frontend/electron/browserTree.cjs`
- Test: `frontend/src/tools/browserTree.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/tools/browserTree.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { nodeLabel, isInteractive, truncateText } from '../../electron/browserTree.cjs'

describe('browserTree — node classification', () => {
  it('prefers the accessible name over text', () => {
    expect(nodeLabel({ role: 'button', name: 'Submit form', text: 'Go' })).toBe('Submit form')
  })

  it('falls back to text when there is no name', () => {
    expect(nodeLabel({ role: 'link', name: '', text: 'Read more' })).toBe('Read more')
  })

  it('falls back to the role when there is neither', () => {
    expect(nodeLabel({ role: 'img', name: '', text: '' })).toBe('img')
  })

  it('treats known interactive roles as interactive', () => {
    expect(isInteractive({ role: 'button' })).toBe(true)
    expect(isInteractive({ role: 'link' })).toBe(true)
    expect(isInteractive({ role: 'textbox' })).toBe(true)
    expect(isInteractive({ role: 'generic' })).toBe(false)
  })

  it('honours an explicit interactive flag from the page', () => {
    expect(isInteractive({ role: 'generic', interactive: true })).toBe(true)
  })

  it('truncates long text and marks it', () => {
    expect(truncateText('x'.repeat(200), 10)).toBe('xxxxxxxxxx…')
    expect(truncateText('short', 10)).toBe('short')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- browserTree`
Expected: FAIL — cannot resolve `../../electron/browserTree.cjs`

- [ ] **Step 3: Write minimal implementation**

Create `frontend/electron/browserTree.cjs`:

```js
// Pure helpers for the desktop browser's accessibility tree.
//
// MUST NOT require('electron'): vitest collects src/**/*.test.js under jsdom,
// where that throws. This split (pure here, Electron glue in browserControl.cjs)
// is the same one rootsCore.cjs / roots.cjs uses, and for the same reason — it
// is what makes the interesting logic testable at all.

const MAX_TEXT = 120
const MAX_NODES = 400

const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'checkbox', 'radio', 'combobox',
  'listbox', 'option', 'slider', 'spinbutton', 'switch', 'tab', 'menuitem',
  'menuitemcheckbox', 'menuitemradio',
])

function truncateText(s, max = MAX_TEXT) {
  const str = typeof s === 'string' ? s : ''
  return str.length > max ? str.slice(0, max) + '…' : str
}

function isInteractive(node) {
  if (!node) return false
  if (node.interactive === true) return true
  return INTERACTIVE_ROLES.has(node.role)
}

function nodeLabel(node) {
  if (!node) return ''
  const name = (node.name || '').trim()
  if (name) return name
  const text = (node.text || '').trim()
  if (text) return text
  return node.role || ''
}

module.exports = {
  MAX_TEXT, MAX_NODES, INTERACTIVE_ROLES,
  truncateText, isInteractive, nodeLabel,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- browserTree`
Expected: PASS, 6 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/electron/browserTree.cjs frontend/src/tools/browserTree.test.js
git commit -m "$(cat <<'EOF'
feat(browser): pure node classification for the desktop browser tree

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Pure tree module — simplification and ref assignment

**Files:**
- Modify: `frontend/electron/browserTree.cjs`
- Test: `frontend/src/tools/browserTree.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/tools/browserTree.test.js`:

```js
import { simplify, assignRefs, parseRef, isStaleRef } from '../../electron/browserTree.cjs'

describe('browserTree — simplification', () => {
  it('drops non-interactive nodes that carry no label', () => {
    const raw = [
      { depth: 0, role: 'generic', name: '', text: '' },
      { depth: 1, role: 'heading', name: 'Title', text: 'Title' },
      { depth: 1, role: 'button', name: 'OK', text: 'OK' },
    ]
    const out = simplify(raw)
    expect(out).toHaveLength(2)
    expect(out.map(n => n.role)).toEqual(['heading', 'button'])
  })

  it('keeps an interactive node even with no label', () => {
    const raw = [{ depth: 0, role: 'button', name: '', text: '' }]
    expect(simplify(raw)).toHaveLength(1)
  })

  it('keeps invisible nodes out of the tree', () => {
    const raw = [
      { depth: 0, role: 'button', name: 'Hidden', visible: false },
      { depth: 0, role: 'button', name: 'Shown', visible: true },
    ]
    expect(simplify(raw).map(n => n.name)).toEqual(['Shown'])
  })
})

describe('browserTree — refs', () => {
  it('numbers only interactive nodes, in document order', () => {
    const nodes = [
      { role: 'heading', name: 'T' },
      { role: 'button', name: 'A' },
      { role: 'link', name: 'B' },
    ]
    const out = assignRefs(nodes, 3)
    expect(out[0].ref).toBeUndefined()
    expect(out[1].ref).toBe('ref_3_0')
    expect(out[2].ref).toBe('ref_3_1')
  })

  it('is stable within an epoch and changes across epochs', () => {
    const mk = () => [{ role: 'button', name: 'A' }]
    expect(assignRefs(mk(), 1)[0].ref).toBe(assignRefs(mk(), 1)[0].ref)
    expect(assignRefs(mk(), 2)[0].ref).not.toBe(assignRefs(mk(), 1)[0].ref)
  })

  it('parses a ref into epoch and index', () => {
    expect(parseRef('ref_7_12')).toEqual({ epoch: 7, index: 12 })
  })

  it('rejects malformed refs rather than guessing', () => {
    expect(parseRef('ref_x')).toBeNull()
    expect(parseRef('12')).toBeNull()
    expect(parseRef('')).toBeNull()
    expect(parseRef(null)).toBeNull()
  })

  it('flags refs from a superseded epoch as stale', () => {
    expect(isStaleRef('ref_1_0', 2)).toBe(true)
    expect(isStaleRef('ref_2_0', 2)).toBe(false)
    expect(isStaleRef('garbage', 2)).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- browserTree`
Expected: FAIL — `simplify is not a function`

- [ ] **Step 3: Write minimal implementation**

In `frontend/electron/browserTree.cjs`, add before `module.exports`:

```js
// A node earns a place in the tree if it can be acted on, or if it says
// something. Everything else is layout scaffolding the model does not need.
function simplify(rawNodes) {
  const list = Array.isArray(rawNodes) ? rawNodes : []
  return list.filter(n => {
    if (!n) return false
    if (n.visible === false) return false
    if (isInteractive(n)) return true
    return !!((n.name || '').trim() || (n.text || '').trim())
  })
}

// Refs carry their epoch so a stale one is detectable rather than silently
// resolving to whatever now sits at that index.
function assignRefs(nodes, epoch) {
  let i = 0
  return (nodes || []).map(n => (
    isInteractive(n) ? { ...n, ref: `ref_${epoch}_${i++}` } : { ...n }
  ))
}

function parseRef(ref) {
  if (typeof ref !== 'string') return null
  const m = /^ref_(\d+)_(\d+)$/.exec(ref)
  if (!m) return null
  return { epoch: Number(m[1]), index: Number(m[2]) }
}

function isStaleRef(ref, currentEpoch) {
  const parsed = parseRef(ref)
  if (!parsed) return true
  return parsed.epoch !== currentEpoch
}
```

Add `simplify, assignRefs, parseRef, isStaleRef` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- browserTree`
Expected: PASS, 15 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/electron/browserTree.cjs frontend/src/tools/browserTree.test.js
git commit -m "$(cat <<'EOF'
feat(browser): tree simplification and epoch-tagged refs

Refs carry their epoch so a stale ref is rejected loudly instead of
resolving to whatever now sits at that index — a wrong click that looks
like a successful one is the failure the tree exists to prevent.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Pure tree module — formatting and truncation

**Files:**
- Modify: `frontend/electron/browserTree.cjs`
- Test: `frontend/src/tools/browserTree.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/tools/browserTree.test.js`:

```js
import { formatTree, buildTree } from '../../electron/browserTree.cjs'

describe('browserTree — formatting', () => {
  it('indents by depth and shows refs', () => {
    const nodes = [
      { depth: 0, role: 'heading', name: 'Login' },
      { depth: 1, role: 'textbox', name: 'Email', ref: 'ref_1_0' },
      { depth: 1, role: 'button', name: 'Go', ref: 'ref_1_1' },
    ]
    expect(formatTree(nodes).split('\n')).toEqual([
      'heading "Login"',
      '  textbox "Email" [ref_1_0]',
      '  button "Go" [ref_1_1]',
    ])
  })

  it('caps indentation so a deep page stays readable', () => {
    const out = formatTree([{ depth: 40, role: 'button', name: 'X', ref: 'ref_1_0' }])
    expect(out.startsWith(' '.repeat(20))).toBe(true)
    expect(out.startsWith(' '.repeat(22))).toBe(false)
  })
})

describe('browserTree — buildTree', () => {
  const raw = (n) => Array.from({ length: n }, (_, i) => ({
    depth: 0, role: 'button', name: `B${i}`, visible: true,
  }))

  it('builds a tree with refs and reports the interactive count', () => {
    const out = buildTree(raw(3), { epoch: 5 })
    expect(out.truncated).toBe(false)
    expect(out.interactiveCount).toBe(3)
    expect(out.text).toContain('[ref_5_0]')
    expect(out.text).toContain('[ref_5_2]')
  })

  it('truncates past the node budget and says so', () => {
    const out = buildTree(raw(20), { epoch: 1, maxNodes: 5 })
    expect(out.truncated).toBe(true)
    expect(out.text).toContain('B0')
    expect(out.text).not.toContain('B19')
    expect(out.text).toMatch(/truncated/i)
  })

  it('numbers refs before truncating so kept refs stay resolvable', () => {
    const out = buildTree(raw(20), { epoch: 1, maxNodes: 3 })
    expect(out.text).toContain('[ref_1_0]')
    expect(out.interactiveCount).toBe(20)
  })

  it('survives an empty page', () => {
    const out = buildTree([], { epoch: 1 })
    expect(out.interactiveCount).toBe(0)
    expect(out.truncated).toBe(false)
    expect(typeof out.text).toBe('string')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- browserTree`
Expected: FAIL — `formatTree is not a function`

- [ ] **Step 3: Write minimal implementation**

Add to `frontend/electron/browserTree.cjs` before `module.exports`:

```js
const MAX_INDENT = 10

function formatTree(nodes) {
  return (nodes || []).map(n => {
    const pad = '  '.repeat(Math.min(Number(n.depth) || 0, MAX_INDENT))
    const label = truncateText(nodeLabel(n))
    const ref = n.ref ? ` [${n.ref}]` : ''
    return `${pad}${n.role || 'node'} "${label}"${ref}`
  }).join('\n')
}

// Refs are assigned BEFORE truncation: a ref that survives into the visible
// slice must resolve to the same element the page-side walker registered, and
// the page registers every interactive node it saw, not just the ones we print.
function buildTree(rawNodes, { epoch = 0, maxNodes = MAX_NODES } = {}) {
  const kept = simplify(rawNodes)
  const withRefs = assignRefs(kept, epoch)
  const interactiveCount = withRefs.filter(n => n.ref).length
  const truncated = withRefs.length > maxNodes
  const slice = truncated ? withRefs.slice(0, maxNodes) : withRefs
  let text = formatTree(slice)
  if (truncated) {
    text += `\n… truncated: showing ${maxNodes} of ${withRefs.length} nodes`
  }
  return { text, truncated, interactiveCount, nodeCount: withRefs.length }
}
```

Add `formatTree, buildTree, MAX_INDENT` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- browserTree`
Expected: PASS, 21 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/electron/browserTree.cjs frontend/src/tools/browserTree.test.js
git commit -m "$(cat <<'EOF'
feat(browser): format and budget-truncate the page tree

Refs are numbered before truncation so a ref that survives into the printed
slice still resolves to the element the page registered.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Pure tree module — in-page walker source

**Files:**
- Modify: `frontend/electron/browserTree.cjs`
- Test: `frontend/src/tools/browserTree.test.js`

The walker runs inside the page via `executeJavaScript`. It is generated here as a
string so it lives beside the logic that consumes its output. It returns a **flat**
list — all shaping happens in `buildTree`, which is why the shaping is testable.

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/tools/browserTree.test.js`:

```js
import { walkerSource, refResolverSource } from '../../electron/browserTree.cjs'

describe('browserTree — injected sources', () => {
  it('walker is a self-contained expression that sets the epoch', () => {
    const src = walkerSource(7)
    expect(typeof src).toBe('string')
    expect(src).toContain('__yogatikRefs__')
    expect(src).toContain('7')
  })

  it('walker source is a single evaluatable expression', () => {
    // executeJavaScript evaluates an expression; a bare statement list would
    // return undefined and the read would silently come back empty.
    expect(walkerSource(1).trim().startsWith('(')).toBe(true)
  })

  it('resolver references the ref registry by index', () => {
    const src = refResolverSource(4)
    expect(src).toContain('__yogatikRefs__')
    expect(src).toContain('[4]')
  })

  it('resolver is a single evaluatable expression', () => {
    expect(refResolverSource(0).trim().startsWith('(')).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- browserTree`
Expected: FAIL — `walkerSource is not a function`

- [ ] **Step 3: Write minimal implementation**

Add to `frontend/electron/browserTree.cjs` before `module.exports`:

```js
// The ref → element mapping lives IN THE PAGE (window.__yogatikRefs__), not in
// main. Main stores only the epoch number. Resolution re-measures the element at
// action time, so an element that moved but still exists is still clicked
// correctly, and main never holds a stale DOM handle.
function walkerSource(epoch) {
  return `(() => {
  const INTERACTIVE_SEL = 'a[href],button,input,select,textarea,summary,[role=button],[role=link],[role=checkbox],[role=tab],[role=menuitem],[role=switch],[contenteditable=true],[onclick],[tabindex]:not([tabindex="-1"])';
  const roleOf = (el) => {
    const explicit = el.getAttribute && el.getAttribute('role');
    if (explicit) return explicit;
    const tag = el.tagName.toLowerCase();
    if (tag === 'a') return el.hasAttribute('href') ? 'link' : 'generic';
    if (tag === 'button' || tag === 'summary') return 'button';
    if (tag === 'select') return 'combobox';
    if (tag === 'textarea') return 'textbox';
    if (tag === 'img') return 'img';
    if (/^h[1-6]$/.test(tag)) return 'heading';
    if (tag === 'input') {
      const t = (el.type || 'text').toLowerCase();
      if (t === 'checkbox') return 'checkbox';
      if (t === 'radio') return 'radio';
      if (t === 'submit' || t === 'button' || t === 'reset') return 'button';
      if (t === 'search') return 'searchbox';
      if (t === 'hidden') return 'hidden';
      return 'textbox';
    }
    if (tag === 'nav') return 'navigation';
    if (tag === 'main') return 'main';
    if (tag === 'form') return 'form';
    if (tag === 'li') return 'listitem';
    return 'generic';
  };
  const nameOf = (el) => {
    const aria = el.getAttribute && el.getAttribute('aria-label');
    if (aria) return aria.trim();
    const labelledby = el.getAttribute && el.getAttribute('aria-labelledby');
    if (labelledby) {
      const t = document.getElementById(labelledby);
      if (t && t.innerText) return t.innerText.trim();
    }
    if (el.tagName === 'IMG') return (el.alt || '').trim();
    if (el.tagName === 'INPUT') {
      return (el.getAttribute('aria-label') || el.placeholder || el.value || el.name || '').trim();
    }
    const title = el.getAttribute && el.getAttribute('title');
    if (title) return title.trim();
    return '';
  };
  const isVisible = (el) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0) return false;
    const s = window.getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none' && s.opacity !== '0';
  };
  const refs = [];
  const nodes = [];
  const walk = (el, depth) => {
    if (!el || nodes.length > 2000) return;
    const tag = el.tagName ? el.tagName.toLowerCase() : '';
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'svg') return;
    const role = roleOf(el);
    if (role !== 'hidden') {
      const visible = isVisible(el);
      const interactive = visible && el.matches && el.matches(INTERACTIVE_SEL);
      let own = '';
      for (const c of el.childNodes) {
        if (c.nodeType === 3) own += c.nodeValue;
      }
      own = own.replace(/\\s+/g, ' ').trim();
      if (interactive || own) {
        if (interactive) refs.push(el);
        nodes.push({
          depth, role,
          name: nameOf(el),
          text: own,
          visible,
          interactive: !!interactive,
        });
      }
    }
    for (const child of el.children) walk(child, depth + 1);
  };
  walk(document.body, 0);
  window.__yogatikRefs__ = refs;
  window.__yogatikRefEpoch__ = ${Number(epoch) || 0};
  return {
    url: location.href,
    title: document.title,
    nodes,
  };
})()`
}

// Resolves one ref index to a fresh viewport-relative centre point. Returns null
// when the element is gone, so the caller can report a stale ref instead of
// clicking empty space.
function refResolverSource(index) {
  return `(() => {
  const el = (window.__yogatikRefs__ || [])[${Number(index) || 0}];
  if (!el || !el.isConnected) return null;
  el.scrollIntoView({ block: 'center', inline: 'center' });
  const r = el.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return null;
  return {
    x: Math.round(r.left + r.width / 2),
    y: Math.round(r.top + r.height / 2),
    tag: el.tagName.toLowerCase(),
  };
})()`
}
```

Add `walkerSource, refResolverSource` to `module.exports`.

- [ ] **Step 4: Run test to verify it passes**

Run: `cd frontend && npm test -- browserTree`
Expected: PASS, 25 tests

- [ ] **Step 5: Commit**

```bash
git add frontend/electron/browserTree.cjs frontend/src/tools/browserTree.test.js
git commit -m "$(cat <<'EOF'
feat(browser): in-page walker and ref resolver sources

The ref registry lives in the page, not in main: resolution re-measures at
action time, so a moved-but-present element is still clicked correctly and
main never holds a stale DOM handle.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Electron module — sessions, tabs, window mode

**Files:**
- Create: `frontend/electron/browserControl.cjs`
- Create: `frontend/electron/browserWindow.html`

- [ ] **Step 1: Create the tab-strip page**

Create `frontend/electron/browserWindow.html`:

```html
<!doctype html>
<meta charset="utf-8">
<title>Yogatik Browser</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; font: 13px system-ui, sans-serif; background: #0a0e14; color: #e6e6e6; }
  #bar { display: flex; align-items: center; gap: 6px; height: 40px; padding: 0 8px;
         background: #11151c; border-bottom: 1px solid #232936; overflow-x: auto; }
  .tab { display: flex; align-items: center; gap: 6px; max-width: 220px; padding: 5px 10px;
         border-radius: 8px; background: #1a1f29; cursor: pointer; white-space: nowrap; flex: 0 0 auto; }
  .tab.active { background: #2a3140; outline: 1px solid #3d4757; }
  .tab span { overflow: hidden; text-overflow: ellipsis; }
  .tab button { background: none; border: 0; color: #8b93a3; cursor: pointer; font-size: 14px; padding: 0 2px; }
  .tab button:hover { color: #fff; }
  #hint { margin-left: auto; color: #6b7280; font-size: 11px; padding-right: 4px; flex: 0 0 auto; }
</style>
<div id="bar"><span id="hint">Yogatik is browsing</span></div>
<script>
  const bar = document.getElementById('bar')
  const hint = document.getElementById('hint')
  window.__setTabs = (tabs, activeId) => {
    for (const el of [...bar.querySelectorAll('.tab')]) el.remove()
    for (const t of tabs) {
      const el = document.createElement('div')
      el.className = 'tab' + (t.tabId === activeId ? ' active' : '')
      const label = document.createElement('span')
      label.textContent = t.title || t.url || 'New tab'
      el.appendChild(label)
      const x = document.createElement('button')
      x.textContent = '×'
      x.title = 'Close tab'
      x.onclick = (e) => { e.stopPropagation(); window.__tabAction('close', t.tabId) }
      el.appendChild(x)
      el.onclick = () => window.__tabAction('select', t.tabId)
      bar.insertBefore(el, hint)
    }
  }
</script>
```

- [ ] **Step 2: Write the session/tab core**

Create `frontend/electron/browserControl.cjs`:

```js
// A real browser the agent can drive, and the user can watch.
//
// The web build cannot do this at all: cross-origin iframes are refused by
// X-Frame-Options on most real sites and are opaque to the parent even when
// allowed. A WebContentsView is a genuine top-level browsing context.
//
// Two surfaces, ONE set of views. Window mode parents the views to a dedicated
// BrowserWindow; panel mode parents the same views to the main window at bounds
// the renderer reports. Switching mode re-parents — it never rebuilds, so tabs,
// history, cookies and refs survive.
//
// Sessions are keyed by conversationId: a logged-in tab must not follow the user
// into an unrelated chat.

const { app, BrowserWindow, WebContentsView, ipcMain } = require('electron')
const path = require('path')
const { buildTree, walkerSource, refResolverSource, parseRef, isStaleRef } = require('./browserTree.cjs')

const TAB_BAR_H = 40
const LOAD_TIMEOUT = 30_000

const sessions = new Map() // conversationId -> session
let mainWindowGetter = () => null
let tabSeq = 0

function newTabId() { return `tab-${++tabSeq}` }

function getSession(conversationId) {
  return sessions.get(conversationId || '__default__') || null
}

function ensureSession(conversationId, mode) {
  const key = conversationId || '__default__'
  let s = sessions.get(key)
  if (!s) {
    s = { key, mode: mode || 'window', win: null, tabs: new Map(), activeTabId: null, bounds: null, detached: false }
    sessions.set(key, s)
  }
  if (mode && mode !== s.mode) setMode(s, mode)
  return s
}

function activeTab(s) {
  if (!s || !s.activeTabId) return null
  return s.tabs.get(s.activeTabId) || null
}

function tabFor(s, tabId) {
  if (tabId) return s.tabs.get(tabId) || null
  return activeTab(s)
}

function listTabs(s) {
  return [...s.tabs.entries()].map(([tabId, t]) => ({
    tabId,
    url: safe(() => t.view.webContents.getURL(), ''),
    title: safe(() => t.view.webContents.getTitle(), ''),
    active: tabId === s.activeTabId,
  }))
}

function safe(fn, fallback) {
  try { return fn() } catch { return fallback }
}

// ── Surfaces ──────────────────────────────────────────────────────────────

function createWindowSurface(s) {
  if (s.win && !s.win.isDestroyed()) return s.win
  s.win = new BrowserWindow({
    width: 1100, height: 800, show: true,
    title: 'Yogatik Browser',
    backgroundColor: '#0a0e14',
    icon: path.join(__dirname, 'icon.ico'),
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: false },
  })
  s.win.loadFile(path.join(__dirname, 'browserWindow.html'))
  s.win.on('resize', () => layout(s))
  // The user closing the browser ends the session; the next call opens a fresh one.
  s.win.on('closed', () => { s.win = null; destroySession(s.key) })
  return s.win
}

function host(s) {
  if (s.mode === 'panel') {
    const mw = mainWindowGetter()
    return (mw && !mw.isDestroyed()) ? mw : null
  }
  return createWindowSurface(s)
}

function layout(s) {
  const t = activeTab(s)
  const h = host(s)
  if (!t || !h || h.isDestroyed()) return
  if (s.mode === 'panel') {
    if (s.detached || !s.bounds) return
    t.view.setBounds(s.bounds)
  } else {
    const [w, hh] = h.getContentSize()
    t.view.setBounds({ x: 0, y: TAB_BAR_H, width: w, height: Math.max(0, hh - TAB_BAR_H) })
  }
}

function showActive(s) {
  const h = host(s)
  if (!h || h.isDestroyed()) return
  for (const [tabId, t] of s.tabs) {
    const attached = h.contentView.children.includes(t.view)
    const shouldShow = tabId === s.activeTabId && !s.detached
    if (shouldShow && !attached) h.contentView.addChildView(t.view)
    if (!shouldShow && attached) h.contentView.removeChildView(t.view)
  }
  layout(s)
  syncTabBar(s)
}

function syncTabBar(s) {
  if (s.mode !== 'window' || !s.win || s.win.isDestroyed()) return
  const payload = JSON.stringify(listTabs(s))
  const active = JSON.stringify(s.activeTabId)
  s.win.webContents.executeJavaScript(
    `window.__setTabs && window.__setTabs(${payload}, ${active})`
  ).catch(() => {})
}

// Re-parent, never rebuild: tabs, cookies and refs survive a mode switch.
function setMode(s, mode) {
  const next = mode === 'panel' ? 'panel' : 'window'
  if (next === s.mode) return s.mode
  const prev = host(s)
  if (prev && !prev.isDestroyed()) {
    for (const t of s.tabs.values()) {
      if (prev.contentView.children.includes(t.view)) prev.contentView.removeChildView(t.view)
    }
  }
  if (s.mode === 'window' && s.win && !s.win.isDestroyed()) {
    const win = s.win
    s.win = null
    win.removeAllListeners('closed')
    win.destroy()
  }
  s.mode = next
  showActive(s)
  return s.mode
}

module.exports = { sessions, getSession, ensureSession, listTabs, setMode, showActive, layout }
```

- [ ] **Step 3: Verify it parses**

Run: `cd frontend && node -e "require('./electron/browserControl.cjs'); console.log('ok')"`
Expected: prints `ok` (Electron APIs are only touched inside functions, so a bare require succeeds)

- [ ] **Step 4: Commit**

```bash
git add frontend/electron/browserControl.cjs frontend/electron/browserWindow.html
git commit -m "$(cat <<'EOF'
feat(browser): session registry, tabs and the two surfaces

Both surfaces host the SAME WebContentsView objects — switching mode
re-parents rather than rebuilding, so tabs, cookies and refs survive.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Electron module — tab lifecycle and navigation

**Files:**
- Modify: `frontend/electron/browserControl.cjs`

- [ ] **Step 1: Add tab creation, navigation and teardown**

Insert before `module.exports` in `frontend/electron/browserControl.cjs`:

```js
function createTab(s, url) {
  const view = new WebContentsView({
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  })
  const tabId = newTabId()
  const tab = { view, refEpoch: 0 }
  s.tabs.set(tabId, tab)
  s.activeTabId = tabId

  const wc = view.webContents
  // A fresh document invalidates every ref issued against the old one.
  wc.on('did-start-navigation', (_e, _url, _inPlace, isMainFrame) => {
    if (isMainFrame) tab.refEpoch++
  })
  wc.on('page-title-updated', () => syncTabBar(s))
  wc.on('did-finish-load', () => syncTabBar(s))
  // Pop-ups become real tabs instead of vanishing.
  wc.setWindowOpenHandler(({ url: target }) => {
    if (/^https?:/.test(target)) { createTab(s, target); showActive(s) }
    return { action: 'deny' }
  })
  wc.on('render-process-gone', () => { s.tabs.delete(tabId); if (s.activeTabId === tabId) s.activeTabId = [...s.tabs.keys()][0] || null; showActive(s) })

  showActive(s)
  if (url) navigate(s, tabId, url)
  return tabId
}

function navigate(s, tabId, url) {
  const t = tabFor(s, tabId)
  if (!t) return Promise.resolve({ success: false, error: 'No such tab' })
  const wc = t.view.webContents
  return new Promise((resolve) => {
    let settled = false
    const done = (payload) => {
      if (settled) return
      settled = true
      clearTimeout(timer)
      wc.removeListener('did-finish-load', ok)
      wc.removeListener('did-fail-load', fail)
      resolve(payload)
    }
    const ok = () => done({ success: true, url: safe(() => wc.getURL(), url), title: safe(() => wc.getTitle(), '') })
    const fail = (_e, code, desc, failedUrl, isMainFrame) => {
      if (!isMainFrame) return
      // -3 is ERR_ABORTED, which a same-page redirect raises routinely.
      if (code === -3) return
      done({ success: false, error: `${desc} (${code})`, url: failedUrl })
    }
    // Never hang the turn on a page that never settles.
    const timer = setTimeout(() => done({
      success: true, timeout: true,
      url: safe(() => wc.getURL(), url), title: safe(() => wc.getTitle(), ''),
      note: 'Load did not finish within 30s; reporting what rendered so far.',
    }), LOAD_TIMEOUT)
    wc.on('did-finish-load', ok)
    wc.on('did-fail-load', fail)
    wc.loadURL(url).catch(err => done({ success: false, error: err.message }))
  })
}

function closeTab(s, tabId) {
  const t = s.tabs.get(tabId)
  if (!t) return { success: false, error: 'No such tab' }
  const h = host(s)
  if (h && !h.isDestroyed() && h.contentView.children.includes(t.view)) {
    h.contentView.removeChildView(t.view)
  }
  safe(() => t.view.webContents.close())
  s.tabs.delete(tabId)
  if (s.activeTabId === tabId) s.activeTabId = [...s.tabs.keys()][0] || null
  // Last tab closed: drop the surface, but keep the session so the next call reopens.
  if (!s.tabs.size && s.mode === 'window' && s.win && !s.win.isDestroyed()) {
    const win = s.win
    s.win = null
    win.removeAllListeners('closed')
    win.destroy()
  }
  showActive(s)
  return { success: true, tabs: listTabs(s) }
}

function destroySession(key) {
  const s = sessions.get(key)
  if (!s) return
  for (const [, t] of s.tabs) safe(() => t.view.webContents.close())
  s.tabs.clear()
  if (s.win && !s.win.isDestroyed()) {
    const win = s.win
    s.win = null
    win.removeAllListeners('closed')
    win.destroy()
  }
  sessions.delete(key)
}

function destroyAllSessions() {
  for (const key of [...sessions.keys()]) destroySession(key)
}
```

Extend `module.exports` with `createTab, navigate, closeTab, destroySession, destroyAllSessions, tabFor, activeTab`.

- [ ] **Step 2: Verify it parses**

Run: `cd frontend && node -e "require('./electron/browserControl.cjs'); console.log('ok')"`
Expected: prints `ok`

- [ ] **Step 3: Commit**

```bash
git add frontend/electron/browserControl.cjs
git commit -m "$(cat <<'EOF'
feat(browser): tab lifecycle, navigation and teardown

Navigation resolves on a 30s timeout with whatever rendered rather than
hanging the agent's turn, and ignores ERR_ABORTED, which same-page
redirects raise routinely.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Electron module — read and interaction

**Files:**
- Modify: `frontend/electron/browserControl.cjs`

- [ ] **Step 1: Add read, click, type, key, scroll, screenshot**

Insert before `module.exports`:

```js
async function readPage(s, tabId) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  const epoch = ++t.refEpoch
  try {
    const raw = await t.view.webContents.executeJavaScript(walkerSource(epoch), true)
    const tree = buildTree(raw.nodes, { epoch })
    return {
      success: true, url: raw.url, title: raw.title,
      tree: tree.text, truncated: tree.truncated,
      interactive_count: tree.interactiveCount,
    }
  } catch (e) {
    return { success: false, error: e.message }
  }
}

// A ref resolves to a point measured NOW. A stale ref is refused outright — it
// must never fall back to a coordinate, because clicking the wrong element looks
// exactly like success.
async function pointFor(t, ref) {
  if (isStaleRef(ref, t.refEpoch)) {
    return { error: 'stale ref — the page changed; call read again', stale: true }
  }
  const { index } = parseRef(ref)
  try {
    const p = await t.view.webContents.executeJavaScript(refResolverSource(index), true)
    if (!p) return { error: 'stale ref — element is gone; call read again', stale: true }
    return p
  } catch (e) {
    return { error: e.message }
  }
}

async function resolveTarget(t, { ref, x, y }) {
  if (ref) return pointFor(t, ref)
  if (typeof x === 'number' && typeof y === 'number') return { x, y }
  return { error: 'Provide either a ref (preferred) or x and y' }
}

async function click(s, { tabId, ref, x, y, button = 'left', double = false }) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  const pt = await resolveTarget(t, { ref, x, y })
  if (pt.error) return { success: false, error: pt.error, stale: !!pt.stale }
  const wc = t.view.webContents
  const base = { x: pt.x, y: pt.y, button, clickCount: double ? 2 : 1 }
  wc.sendInputEvent({ ...base, type: 'mouseDown' })
  wc.sendInputEvent({ ...base, type: 'mouseUp' })
  return { success: true, clicked: { x: pt.x, y: pt.y }, ref: ref || null }
}

async function typeText(s, { tabId, ref, text, submit = false }) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  if (typeof text !== 'string') return { success: false, error: 'text is required' }
  if (ref) {
    const r = await click(s, { tabId, ref })
    if (!r.success) return r
  }
  const wc = t.view.webContents
  for (const ch of text) {
    wc.sendInputEvent({ type: 'char', keyCode: ch })
  }
  if (submit) wc.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
  return { success: true, typed: text.length, submitted: !!submit }
}

async function pressKey(s, { tabId, keys }) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  if (!keys) return { success: false, error: 'keys is required' }
  const parts = String(keys).toLowerCase().split('+').map(p => p.trim()).filter(Boolean)
  const key = parts.pop()
  const modifiers = parts.map(p => ({ ctrl: 'control', cmd: 'meta', command: 'meta' }[p] || p))
  const KEYMAP = {
    enter: 'Return', return: 'Return', tab: 'Tab', escape: 'Escape', esc: 'Escape',
    backspace: 'Backspace', delete: 'Delete', up: 'Up', down: 'Down', left: 'Left',
    right: 'Right', home: 'Home', end: 'End', pageup: 'PageUp', pagedown: 'PageDown',
    space: 'Space',
  }
  const keyCode = KEYMAP[key] || (key && key.length === 1 ? key : null)
  if (!keyCode) return { success: false, error: `Unsupported key: ${keys}` }
  const wc = t.view.webContents
  wc.sendInputEvent({ type: 'keyDown', keyCode, modifiers })
  wc.sendInputEvent({ type: 'keyUp', keyCode, modifiers })
  return { success: true, keys }
}

async function scroll(s, { tabId, ref, amount = -400 }) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  let pt = { x: 400, y: 400 }
  if (ref) {
    const p = await pointFor(t, ref)
    if (p.error) return { success: false, error: p.error, stale: !!p.stale }
    pt = p
  }
  t.view.webContents.sendInputEvent({
    type: 'mouseWheel', x: pt.x, y: pt.y, deltaX: 0, deltaY: amount, canScroll: true,
  })
  return { success: true, scrolled: amount }
}

async function screenshot(s, tabId) {
  const t = tabFor(s, tabId)
  if (!t) return { success: false, error: 'No such tab' }
  try {
    const img = await t.view.webContents.capturePage()
    return { success: true, image: img.toDataURL() }
  } catch (e) {
    return { success: false, error: e.message }
  }
}
```

Extend `module.exports` with `readPage, click, typeText, pressKey, scroll, screenshot`.

- [ ] **Step 2: Verify it parses**

Run: `cd frontend && node -e "require('./electron/browserControl.cjs'); console.log('ok')"`
Expected: prints `ok`

- [ ] **Step 3: Commit**

```bash
git add frontend/electron/browserControl.cjs
git commit -m "$(cat <<'EOF'
feat(browser): read the page tree and act on it

A ref resolves to a point measured now; a stale ref is refused outright and
never falls back to a coordinate, because clicking the wrong element looks
exactly like success.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: Electron module — IPC surface and main wiring

**Files:**
- Modify: `frontend/electron/browserControl.cjs`
- Modify: `frontend/electron/main.cjs:32` (imports), `:208` (registration), `:617` (`will-quit`)

- [ ] **Step 1: Add the IPC registration**

Insert before `module.exports` in `frontend/electron/browserControl.cjs`:

```js
function registerBrowserControl(getMainWindow) {
  mainWindowGetter = typeof getMainWindow === 'function' ? getMainWindow : () => null

  // conversationId is supplied by the renderer as an opaque key, exactly like the
  // workspace-roots ctx. It names a session, never a filesystem path.
  const S = (p, mode) => ensureSession(p && p.conversationId, mode || (p && p.display))

  ipcMain.handle('browser:navigate', async (_e, p = {}) => {
    const s = S(p)
    let tabId = p.tabId
    if (!s.tabs.size) tabId = createTab(s, null)
    const res = await navigate(s, tabId, p.url)
    showActive(s)
    return { ...res, tabId: tabId || s.activeTabId, mode: s.mode }
  })

  ipcMain.handle('browser:read', (_e, p = {}) => readPage(S(p), p.tabId))
  ipcMain.handle('browser:click', (_e, p = {}) => click(S(p), p))
  ipcMain.handle('browser:type', (_e, p = {}) => typeText(S(p), p))
  ipcMain.handle('browser:key', (_e, p = {}) => pressKey(S(p), p))
  ipcMain.handle('browser:scroll', (_e, p = {}) => scroll(S(p), p))
  ipcMain.handle('browser:screenshot', (_e, p = {}) => screenshot(S(p), p.tabId))

  ipcMain.handle('browser:new-tab', async (_e, p = {}) => {
    const s = S(p)
    const tabId = createTab(s, null)
    const res = p.url ? await navigate(s, tabId, p.url) : { success: true }
    showActive(s)
    return { ...res, tabId, tabs: listTabs(s) }
  })

  ipcMain.handle('browser:list-tabs', (_e, p = {}) => {
    const s = getSession(p.conversationId)
    return { success: true, tabs: s ? listTabs(s) : [], mode: s ? s.mode : null }
  })

  ipcMain.handle('browser:select-tab', (_e, p = {}) => {
    const s = S(p)
    if (!s.tabs.has(p.tabId)) return { success: false, error: 'No such tab' }
    s.activeTabId = p.tabId
    showActive(s)
    return { success: true, tabs: listTabs(s) }
  })

  ipcMain.handle('browser:close-tab', (_e, p = {}) => closeTab(S(p), p.tabId))

  ipcMain.handle('browser:history', async (_e, p = {}) => {
    const s = S(p)
    const t = tabFor(s, p.tabId)
    if (!t) return { success: false, error: 'No such tab' }
    const nav = t.view.webContents.navigationHistory
    if (p.direction === 'forward') {
      if (!nav.canGoForward()) return { success: false, error: 'No forward history' }
      nav.goForward()
    } else {
      if (!nav.canGoBack()) return { success: false, error: 'No back history' }
      nav.goBack()
    }
    return { success: true, url: safe(() => t.view.webContents.getURL(), '') }
  })

  ipcMain.handle('browser:set-mode', (_e, p = {}) => {
    const s = S(p)
    return { success: true, mode: setMode(s, p.display) }
  })

  // Panel geometry. A WebContentsView composites ABOVE the DOM, so the React
  // panel is chrome around a hole and reports where the hole is. A rectangle
  // cannot escape a sandbox, so trusting the renderer here is safe — this is not
  // an exception to "the renderer never names a filesystem root".
  ipcMain.handle('browser:set-bounds', (_e, p = {}) => {
    const s = getSession(p.conversationId)
    if (!s) return { success: false }
    s.bounds = {
      x: Math.round(p.x || 0), y: Math.round(p.y || 0),
      width: Math.max(0, Math.round(p.width || 0)),
      height: Math.max(0, Math.round(p.height || 0)),
    }
    layout(s)
    return { success: true }
  })

  // An overlay that should cover the panel would be painted UNDER the view, so
  // the panel detaches it while a modal is open and re-attaches on close.
  ipcMain.handle('browser:set-detached', (_e, p = {}) => {
    const s = getSession(p.conversationId)
    if (!s) return { success: false }
    s.detached = !!p.detached
    showActive(s)
    return { success: true, detached: s.detached }
  })

  ipcMain.handle('browser:close', (_e, p = {}) => {
    destroySession((p && p.conversationId) || '__default__')
    return { success: true }
  })
}
```

Extend `module.exports` with `registerBrowserControl`.

- [ ] **Step 2: Wire it into main**

In `frontend/electron/main.cjs`, after line 32 (`registerCompanionInput` import) add:

```js
const { registerBrowserControl, destroyAllSessions } = require('./browserControl.cjs')
```

After line 208 (`registerCompanionInput()`) add:

```js
    registerBrowserControl(() => mainWindow)
```

In the `app.on('will-quit', ...)` handler at line 617, add alongside the other cleanups:

```js
    destroyAllSessions()
```

- [ ] **Step 3: Verify the app still boots**

Run: `cd frontend && npx electron . --version 2>&1 | head -3`
Expected: no `MODULE_NOT_FOUND` or syntax error

- [ ] **Step 4: Commit**

```bash
git add frontend/electron/browserControl.cjs frontend/electron/main.cjs
git commit -m "$(cat <<'EOF'
feat(browser): IPC surface and main-process wiring

Panel bounds come from the renderer because a WebContentsView composites
above the DOM and the React panel is chrome around a hole. A rectangle
cannot escape a sandbox, so this is not an exception to the rule that the
renderer never names a filesystem root.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: Preload bridge

**Files:**
- Modify: `frontend/electron/preload.cjs` (after the `__YOGATIK_DIALOG__` block, line 158)

- [ ] **Step 1: Add the bridge**

Insert after line 158 in `frontend/electron/preload.cjs`:

```js
// Real browser the agent can drive and the user can watch. Web builds have no
// equivalent — cross-origin iframes are refused and opaque.
contextBridge.exposeInMainWorld('__YOGATIK_BROWSER__', {
  navigate: (p) => ipcRenderer.invoke('browser:navigate', p || {}),
  read: (p) => ipcRenderer.invoke('browser:read', p || {}),
  click: (p) => ipcRenderer.invoke('browser:click', p || {}),
  type: (p) => ipcRenderer.invoke('browser:type', p || {}),
  key: (p) => ipcRenderer.invoke('browser:key', p || {}),
  scroll: (p) => ipcRenderer.invoke('browser:scroll', p || {}),
  screenshot: (p) => ipcRenderer.invoke('browser:screenshot', p || {}),
  newTab: (p) => ipcRenderer.invoke('browser:new-tab', p || {}),
  listTabs: (p) => ipcRenderer.invoke('browser:list-tabs', p || {}),
  selectTab: (p) => ipcRenderer.invoke('browser:select-tab', p || {}),
  closeTab: (p) => ipcRenderer.invoke('browser:close-tab', p || {}),
  history: (p) => ipcRenderer.invoke('browser:history', p || {}),
  setMode: (p) => ipcRenderer.invoke('browser:set-mode', p || {}),
  setBounds: (p) => ipcRenderer.invoke('browser:set-bounds', p || {}),
  setDetached: (p) => ipcRenderer.invoke('browser:set-detached', p || {}),
  close: (p) => ipcRenderer.invoke('browser:close', p || {}),
})
```

- [ ] **Step 2: Verify it parses**

Run: `cd frontend && node --check electron/preload.cjs && echo ok`
Expected: prints `ok`

- [ ] **Step 3: Commit**

```bash
git add frontend/electron/preload.cjs
git commit -m "$(cat <<'EOF'
feat(browser): expose __YOGATIK_BROWSER__ bridge

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: The `browser_control` tool

**Files:**
- Create: `frontend/src/tools/browserControl.js`
- Modify: `frontend/src/tools/index.js`
- Test: `frontend/src/tools/desktopCapabilities.test.js`

- [ ] **Step 1: Write the failing test**

In `frontend/src/tools/desktopCapabilities.test.js`, add `'__YOGATIK_BROWSER__'` to the `BRIDGES` array, add the import at the top:

```js
import { browserControlTool } from './browserControl'
```

and add these tests inside the `describe('desktop-only capability tools', ...)` block:

```js
  it('browser_control returns desktop-only note in the browser', async () => {
    const res = await browserControlTool.execute({ action: 'navigate', url: 'https://example.com' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/desktop app/i)
  })

  it('browser_control rejects an unknown action', async () => {
    window.__YOGATIK_BROWSER__ = { navigate: async () => ({ success: true }) }
    const res = await browserControlTool.execute({ action: 'teleport' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/unsupported/i)
  })

  it('browser_control requires a url to navigate', async () => {
    window.__YOGATIK_BROWSER__ = { navigate: async () => ({ success: true }) }
    const res = await browserControlTool.execute({ action: 'navigate' })
    expect(res.success).toBe(false)
    expect(res.error).toMatch(/url/i)
  })

  it('browser_control passes the conversation id through as an opaque key', async () => {
    let seen = null
    window.__YOGATIK_BROWSER__ = { read: async (p) => { seen = p; return { success: true, tree: '' } } }
    await browserControlTool.execute({ action: 'read' })
    expect(seen).toHaveProperty('conversationId')
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npm test -- desktopCapabilities`
Expected: FAIL — cannot resolve `./browserControl`

- [ ] **Step 3: Write the tool**

Create `frontend/src/tools/browserControl.js`:

```js
/**
 * browser_control — a real browser the agent drives and the user watches.
 *
 * The web build cannot do this: cross-origin iframes are refused by
 * X-Frame-Options on most real sites and are opaque to the parent even when
 * allowed. web_extract/web_search fetch static HTML; this runs the page.
 *
 * Elements are addressed by ref from `read`, not by pixel guessing. Refs go
 * stale on navigation and are refused loudly rather than clicking blind.
 *
 * Desktop app only.
 */

import { getWorkspaceCtx } from './localFs'
import { getSetting } from '../db'

function bridge() {
  return (typeof window !== 'undefined' && window.__YOGATIK_BROWSER__) || null
}

const DESKTOP_ONLY = {
  success: false,
  error: 'Browser control runs only in the Yogatik desktop app.',
}

// The chat owns its browsing session. Supplied here, never a tool parameter —
// the model must not be able to reach into another chat's logged-in tabs.
//
// Surface: an explicit `display` from the model wins; otherwise the user's
// stored default; otherwise a window.
async function ctx(display) {
  const { conversationId } = getWorkspaceCtx() || {}
  let mode = display
  if (!mode) {
    try {
      const prefs = await getSetting('chat_prefs', {})
      mode = prefs?.browser_display_mode === 'panel' ? 'panel' : 'window'
    } catch { mode = 'window' }
  }
  return { conversationId: conversationId || null, display: mode }
}

export const browserControlTool = {
  schema: {
    type: 'function',
    function: {
      name: 'browser_control',
      description:
        'Open and USE a real web browser the user can watch: navigate, read the page structure, click, type, scroll and manage tabs. ' +
        'Unlike web_extract/web_search (which only fetch static HTML), this runs the page\'s JavaScript, so it works on logged-in pages and apps. ' +
        'ALWAYS call action "read" first: it returns the page as a tree where every clickable element has a [ref_N] handle. ' +
        'Then click or type using that ref — do not guess x/y coordinates unless the target is a canvas or custom widget with no ref. ' +
        'Refs go stale when the page changes; if you get a stale-ref error, call "read" again. ' +
        'Ask the user before any action that submits, sends, deletes, buys, or posts anything. Desktop app only.',
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: [
              'navigate', 'read', 'click', 'double_click', 'right_click', 'type', 'key',
              'scroll', 'screenshot', 'new_tab', 'list_tabs', 'select_tab', 'close_tab',
              'back', 'forward', 'set_mode', 'close',
            ],
            description: 'What to do.',
          },
          url: { type: 'string', description: 'URL for navigate / new_tab.' },
          ref: { type: 'string', description: 'Element handle from a previous read, e.g. "ref_3_12". Preferred over x/y.' },
          x: { type: 'number', description: 'Fallback X coordinate, only when no ref exists (canvas/custom widgets).' },
          y: { type: 'number', description: 'Fallback Y coordinate, only when no ref exists.' },
          text: { type: 'string', description: 'Text to type for action "type".' },
          submit: { type: 'boolean', description: 'Press Enter after typing. Confirm with the user first — this submits.' },
          keys: { type: 'string', description: 'Key or combo for action "key": "enter", "tab", "escape", "ctrl+a".' },
          amount: { type: 'number', description: 'Scroll distance in pixels; negative scrolls down (default -400).' },
          tabId: { type: 'string', description: 'Target tab. Defaults to the active tab.' },
          display: { type: 'string', enum: ['window', 'panel'], description: 'Show the browser in a separate window or docked in the app. Omit to use the user\'s preferred surface.' },
        },
        required: ['action'],
      },
    },
  },

  async execute({ action, url, ref, x, y, text, submit, keys, amount, tabId, display } = {}) {
    const b = bridge()
    if (!b) return DESKTOP_ONLY
    const base = await ctx(display)
    try {
      switch (action) {
        case 'navigate':
          if (!url) return { success: false, error: 'url is required to navigate' }
          return { tool: 'browser_control', action, ...(await b.navigate({ ...base, url, tabId })) }
        case 'read':
          return { tool: 'browser_control', action, ...(await b.read({ ...base, tabId })) }
        case 'click':
        case 'double_click':
        case 'right_click':
          return {
            tool: 'browser_control', action,
            ...(await b.click({
              ...base, tabId, ref, x, y,
              button: action === 'right_click' ? 'right' : 'left',
              double: action === 'double_click',
            })),
          }
        case 'type':
          if (typeof text !== 'string') return { success: false, error: 'text is required to type' }
          return { tool: 'browser_control', action, ...(await b.type({ ...base, tabId, ref, text, submit })) }
        case 'key':
          if (!keys) return { success: false, error: 'keys is required' }
          return { tool: 'browser_control', action, ...(await b.key({ ...base, tabId, keys })) }
        case 'scroll':
          return { tool: 'browser_control', action, ...(await b.scroll({ ...base, tabId, ref, amount })) }
        case 'screenshot':
          return { tool: 'browser_control', action, ...(await b.screenshot({ ...base, tabId })) }
        case 'new_tab':
          return { tool: 'browser_control', action, ...(await b.newTab({ ...base, url })) }
        case 'list_tabs':
          return { tool: 'browser_control', action, ...(await b.listTabs(base)) }
        case 'select_tab':
          if (!tabId) return { success: false, error: 'tabId is required' }
          return { tool: 'browser_control', action, ...(await b.selectTab({ ...base, tabId })) }
        case 'close_tab':
          if (!tabId) return { success: false, error: 'tabId is required' }
          return { tool: 'browser_control', action, ...(await b.closeTab({ ...base, tabId })) }
        case 'back':
        case 'forward':
          return { tool: 'browser_control', action, ...(await b.history({ ...base, tabId, direction: action })) }
        case 'set_mode':
          if (!display) return { success: false, error: 'display is required: "window" or "panel"' }
          return { tool: 'browser_control', action, ...(await b.setMode(base)) }
        case 'close':
          return { tool: 'browser_control', action, ...(await b.close(base)) }
        default:
          return { success: false, error: `Unsupported action: ${action}` }
      }
    } catch (e) {
      return { success: false, error: e?.message || String(e) }
    }
  },
}
```

- [ ] **Step 4: Register the tool**

In `frontend/src/tools/index.js`, add the import beside the other desktop tools (near line 66):

```js
import { browserControlTool } from './browserControl'
```

In `ALL_TOOLS`, after the `browser_autopilot: browserAutopilotTool,` line (295):

```js
  browser_control: browserControlTool,
```

In the alias map (near line 342), add:

```js
  browse: 'browser_control',
  open_url: 'browser_control',
  web_browse: 'browser_control',
  browser: 'browser_control',
  click_element: 'browser_control',
  browser_read: 'browser_control',
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `cd frontend && npm test -- desktopCapabilities`
Expected: PASS, including the 4 new cases

- [ ] **Step 6: Commit**

```bash
git add frontend/src/tools/browserControl.js frontend/src/tools/index.js frontend/src/tools/desktopCapabilities.test.js
git commit -m "$(cat <<'EOF'
feat(browser): browser_control tool

Addresses elements by ref from read() rather than pixel guessing, and
carries the conversation id as an opaque session key so the model cannot
reach another chat's logged-in tabs.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 11: Stop `browser_autopilot` overclaiming

**Files:**
- Modify: `frontend/src/tools/index.js:147-165`

`browser_autopilot` is `proxyFetch` + regex tag-stripping. Its current description
("Autonomous browser worker that navigates to a URL... like Strawberry Browser")
will make the model pick it when it wants a real browser.

- [ ] **Step 1: Correct the description**

In `frontend/src/tools/index.js`, replace the `description` on line 152 with:

```js
      description: 'Fetch a web page\'s static HTML and extract its text, optionally focused on a query. Does NOT run JavaScript, log in, click, or see what a page renders — for that use browser_control (desktop app). Good for quick text extraction from simple public pages.',
```

- [ ] **Step 2: Verify the suite still passes**

Run: `cd frontend && npm test`
Expected: PASS, no regressions

- [ ] **Step 3: Commit**

```bash
git add frontend/src/tools/index.js
git commit -m "$(cat <<'EOF'
fix(tools): browser_autopilot no longer claims to drive a browser

It is proxyFetch plus regex tag-stripping — it cannot run JavaScript, log
in, or click. The old description ("navigates to a URL... like Strawberry
Browser") would make the model choose it over the real browser_control.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 12: Panel component and styles

**Files:**
- Create: `frontend/src/components/BrowserPanel.jsx`
- Modify: `frontend/src/styles.css`

- [ ] **Step 1: Add the styles**

Append to `frontend/src/styles.css`:

```css
/* Docked browser. The WebContentsView composites ABOVE this DOM, so
   .browser-panel-hole is deliberately empty — it only measures where the
   native view should sit. */
.browser-panel {
  position: absolute;
  top: 0;
  right: 0;
  width: 50%;
  min-width: 360px;
  height: 100%;
  background: var(--bg-secondary);
  border-left: 1px solid var(--border);
  display: flex;
  flex-direction: column;
  z-index: 100;
  box-shadow: -8px 0 24px rgba(0, 0, 0, 0.4);
}
.browser-panel-header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  flex: 0 0 auto;
}
.browser-panel-url {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 12px;
  color: var(--text-secondary);
}
.browser-panel-hole { flex: 1; min-height: 0; }

@media (max-width: 768px) {
  .browser-panel { width: 100%; min-width: unset; }
}
```

- [ ] **Step 2: Create the component**

Create `frontend/src/components/BrowserPanel.jsx`:

```jsx
import React, { useEffect, useRef, useCallback } from 'react'
import { ExternalLink, X } from 'lucide-react'

// Chrome around a hole. A WebContentsView is an OS-level layer composited above
// the renderer's DOM — it cannot be occluded by React markup and z-index does not
// apply to it. So this panel renders the frame and reports where the native view
// should sit; main positions it to match.
export function BrowserPanel({ conversationId, url, onPopOut, onClose, occluded }) {
  const holeRef = useRef(null)

  const br = () => (typeof window !== 'undefined' && window.__YOGATIK_BROWSER__) || null

  const report = useCallback(() => {
    const b = br()
    const el = holeRef.current
    if (!b || !el) return
    const r = el.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1
    // Electron's setBounds takes DIPs, but getBoundingClientRect is already in
    // CSS px which equal DIPs, so no scaling is applied. dpr is read only to
    // round consistently on fractional-scale displays.
    b.setBounds({
      conversationId,
      x: Math.round(r.left * dpr) / dpr,
      y: Math.round(r.top * dpr) / dpr,
      width: Math.round(r.width),
      height: Math.round(r.height),
    })
  }, [conversationId])

  useEffect(() => {
    report()
    const ro = new ResizeObserver(report)
    if (holeRef.current) ro.observe(holeRef.current)
    window.addEventListener('resize', report)
    return () => { ro.disconnect(); window.removeEventListener('resize', report) }
  }, [report])

  // Any overlay that should cover this panel would be painted UNDER the native
  // view, so detach it while one is open.
  useEffect(() => {
    const b = br()
    if (!b) return
    b.setDetached({ conversationId, detached: !!occluded })
  }, [occluded, conversationId])

  useEffect(() => {
    const b = br()
    return () => { if (b) b.setDetached({ conversationId, detached: true }) }
  }, [conversationId])

  return (
    <div className="browser-panel">
      <div className="browser-panel-header">
        <span className="browser-panel-url" title={url}>{url || 'Browser'}</span>
        <button className="artifact-btn" onClick={onPopOut} title="Open in a separate window" aria-label="Open in a separate window">
          <ExternalLink size={16} />
        </button>
        <button className="artifact-btn close" onClick={onClose} title="Close browser" aria-label="Close browser">
          <X size={16} />
        </button>
      </div>
      <div className="browser-panel-hole" ref={holeRef} />
    </div>
  )
}
```

- [ ] **Step 3: Verify the build**

Run: `cd frontend && npx eslint@9 src/components/BrowserPanel.jsx --no-eslintrc --parser-options=ecmaVersion:2022,sourceType:module,ecmaFeatures:{jsx:true} 2>&1 | head -5`
Expected: no `no-undef` / parse errors

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/BrowserPanel.jsx frontend/src/styles.css
git commit -m "$(cat <<'EOF'
feat(browser): docked panel chrome

The panel is chrome around a hole: a WebContentsView composites above the
DOM, so React can only measure where the native view should sit. Modals
would be painted under it, hence the detach-while-occluded effect.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 13: App wiring — mode preference and chat-switch teardown

**Files:**
- Modify: `frontend/src/App.jsx`
- Modify: `frontend/src/components/PersonalisePanel.jsx`

- [ ] **Step 1: Render the panel and tear down on chat switch**

In `frontend/src/App.jsx`, add the import beside `ArtifactPanel` (line 9):

```js
import { BrowserPanel } from './components/BrowserPanel'
```

Add state near the other panel state (beside line 307's `showDownloadModal`):

```js
  const [browserPanel, setBrowserPanel] = useState(null) // { url } when docked
```

Add this effect after the existing conversation-switch effects (near line 1215's `setActiveIdx(idx)` usage — place it with the other `useEffect`s that depend on the active conversation):

```js
  // A browsing session carries logged-in state. It must not follow the user into
  // an unrelated chat, so switching conversations ends it.
  const activeConvId = conversations[activeIdx]?.id
  useEffect(() => {
    const b = window.__YOGATIK_BROWSER__
    if (!b) return
    setBrowserPanel(null)
    return () => { try { b.close({ conversationId: activeConvId }) } catch { /* ignore */ } }
  }, [activeConvId])
```

Render the panel beside `ArtifactPanel` (line 3572):

```jsx
      {browserPanel && (
        <BrowserPanel
          conversationId={activeConvId}
          url={browserPanel.url}
          occluded={!!(showPersonalise || showSkills || showAgents || showToolPicker || showAd)}
          onPopOut={() => {
            window.__YOGATIK_BROWSER__?.setMode({ conversationId: activeConvId, display: 'window' })
            updatePref('browser_display_mode', 'window')
            setBrowserPanel(null)
          }}
          onClose={() => {
            window.__YOGATIK_BROWSER__?.close({ conversationId: activeConvId })
            setBrowserPanel(null)
          }}
        />
      )}
```

Open the panel when a browser tool result comes back in panel mode — inside the
existing tool-result handling, add:

```js
        if (r?.tool === 'browser_control' && r?.mode === 'panel') {
          setBrowserPanel({ url: r.url || '' })
        }
```

- [ ] **Step 2: Add the preference control**

In `frontend/src/components/PersonalisePanel.jsx`, add near the other derived prefs (after line 27):

```js
  const browserSurface = prefs.browser_display_mode === 'panel' ? 'panel' : 'window'
```

and add this control in the panel body, beside the other selects:

```jsx
      <div className="pref-row">
        <div>
          <div className="pref-label">Browser surface</div>
          <div className="pref-hint">Where the AI opens web pages it needs to use.</div>
        </div>
        <select
          className="style-select"
          value={browserSurface}
          onChange={(e) => onChange('browser_display_mode', e.target.value)}
        >
          <option value="window">Separate window</option>
          <option value="panel">Docked in the app</option>
        </select>
      </div>
```

The tool already reads this preference — `ctx()` in
`frontend/src/tools/browserControl.js` (Task 10) resolves
`chat_prefs.browser_display_mode` whenever the model supplies no `display`. No
further change is needed there.

- [ ] **Step 3: Run the full suite**

Run: `cd frontend && npm test`
Expected: PASS, no regressions

- [ ] **Step 4: Lint**

Run: `cd frontend && npm run lint`
Expected: no new errors

- [ ] **Step 5: Commit**

```bash
git add frontend/src/App.jsx frontend/src/components/PersonalisePanel.jsx
git commit -m "$(cat <<'EOF'
feat(browser): surface preference and per-chat session teardown

A browsing session carries logged-in state, so switching conversations
ends it rather than letting an authenticated tab follow the user into an
unrelated chat.

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 14: Desktop Operator agent

**Files:**
- Modify: `frontend/src/agents.js:222-223`

- [ ] **Step 1: Add the tool and the look-then-act guidance**

In `frontend/src/agents.js`, in the Desktop Operator preset, append to `system`
(before the closing "These tools only work in the desktop app" sentence):

```
For anything on the web — logging in, filling a form, clicking through an app, reading a page that needs JavaScript — use browser_control, not web_search or browser_autopilot: call action "read" to get the page as a tree of [ref_N] handles, then click/type by ref. Re-read after the page changes; a stale ref is refused rather than clicked blind.
```

and add `'browser_control'` to its `tools` array.

- [ ] **Step 2: Verify the preset tests still pass**

Run: `cd frontend && npm test -- agents`
Expected: PASS — `agents.test.js` asserts every preset tool is a registered tool, so this confirms registration from Task 10 worked

- [ ] **Step 3: Commit**

```bash
git add frontend/src/agents.js
git commit -m "$(cat <<'EOF'
feat(agents): Desktop Operator can drive a real browser

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 15: Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Document the subsystem**

Add after the "AI companion — real computer use (v3.15)" section in `CLAUDE.md`:

```markdown
## Real browser control (v3.16) — desktop only
- electron/browserTree.cjs is PURE (no require('electron'), so vitest reaches it under jsdom):
  in-page walker source, simplify/assignRefs/buildTree/formatTree, parseRef/isStaleRef. Same split
  as rootsCore.cjs — it is the only reason the tree logic is testable. browserTree.test.js = 25.
- electron/browserControl.cjs owns per-conversation sessions of WebContentsView tabs.
  ONE set of views, TWO surfaces: window mode parents them to a dedicated BrowserWindow (with
  browserWindow.html as a tab strip), panel mode parents the SAME views to the main window.
  setMode re-parents; it never rebuilds, so tabs/cookies/refs survive a switch.
- A WebContentsView composites ABOVE the renderer's DOM — z-index does not apply. BrowserPanel.jsx
  is therefore chrome around a hole: it reports its content rect via browser:set-bounds and main
  positions the view to match. Any modal that should cover the panel would be painted UNDER it, so
  the panel calls browser:set-detached while one is open. Renderer-supplied BOUNDS are safe (a
  rectangle escapes nothing); this is NOT an exception to "the renderer never names a filesystem root".
- Refs are epoch-tagged (ref_<epoch>_<n>); the epoch bumps on main-frame navigation and on every
  read. The ref→element map lives in the PAGE (window.__yogatikRefs__); main stores only the epoch
  and re-measures at action time. A stale ref returns {stale:true} and is NEVER downgraded to a
  coordinate click — clicking the wrong element looks exactly like success.
- Sessions are keyed by conversationId (injected via getWorkspaceCtx, never a tool parameter) and
  destroyed on chat switch: an authenticated tab must not follow the user into an unrelated chat.
- navigate() resolves on a 30s timeout with whatever rendered rather than hanging the turn, and
  ignores did-fail-load code -3 (ERR_ABORTED), which same-page redirects raise routinely.
- browser_autopilot is NOT a browser: it is proxyFetch + regex tag-stripping (a web_extract
  duplicate). Its description used to claim it navigated pages, which made the model pick it over
  the real tool; it now says plainly that it does not run JavaScript.
```

Also update the test count line under "## Tests" and the tool count in the architecture header.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs: record the browser-control subsystem and its gotchas

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```

---

## Task 16: Manual verification

The Electron glue is not unit-tested, consistent with every other `electron/*.cjs`
module. It must be exercised by hand before this is called done.

- [ ] **Step 1: Launch the desktop app**

Run: `cd frontend && npm run electron:dev` (or `npx electron .` against a built `dist-electron`)

- [ ] **Step 2: Window mode**

Ask the agent: *"Open example.com in the browser and read the page."*
Expected: a separate window opens with a tab strip, the page loads, and the tool
result contains a tree with `[ref_N]` handles.

- [ ] **Step 3: Interaction by ref**

Ask: *"Go to duckduckgo.com, read it, type 'electron webcontentsview' into the search box and press enter."*
Expected: text lands in the real search field; results load.

- [ ] **Step 4: Stale refs**

Ask it to read a page, navigate elsewhere, then click a ref from the first read.
Expected: `stale: true` with "call read again" — **not** a click.

- [ ] **Step 5: Panel mode and occlusion**

Switch **Browser surface** to *Docked in the app* in Personalise, run a navigation,
then open the Personalise panel over it.
Expected: the browser docks on the right at the panel's bounds; opening Personalise
hides the native view rather than being painted underneath it; closing restores it.

- [ ] **Step 6: Tabs and teardown**

Open two tabs, switch between them from the tab strip, then switch chats.
Expected: tab strip reflects both; switching conversations closes the browser entirely.

- [ ] **Step 7: Web build honesty**

Run: `cd frontend && npm run build && npm run preview`, then ask the web app to browse.
Expected: "Browser control runs only in the Yogatik desktop app."

- [ ] **Step 8: Full suite and lint**

Run: `cd frontend && npm test && npm run lint`
Expected: all green, no new lint errors

- [ ] **Step 9: Commit any fixes found**

```bash
git add -A
git commit -m "$(cat <<'EOF'
fix(browser): corrections from manual verification

Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
EOF
)"
```
