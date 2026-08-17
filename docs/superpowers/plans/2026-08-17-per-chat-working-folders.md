# Per-Chat Working Folders Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every chat its own set of working folders (Claude Code's model), replacing the single app-wide granted root.

**Architecture:** The Electron main process owns a registry of user-granted directories plus a bindings table (`chat:` → `project:` → `default:`). Pure resolution logic lives in `electron/rootsCore.cjs` with no Electron import so it is unit-testable; `electron/roots.cjs` adds persistence and IPC. Every `fs_*` and `terminal:exec` call carries an opaque `ctx = {conversationId, projectId}`; the renderer never names a filesystem path.

**Tech Stack:** Electron (CommonJS main process), React 18 renderer, Vitest (jsdom, `src/**/*.test.{js,jsx}`), Dexie.

**Spec:** `docs/superpowers/specs/2026-08-17-per-chat-working-folders-design.md`

---

## File Structure

| File | Responsibility |
|---|---|
| `frontend/electron/rootsCore.cjs` | **Create.** Pure: id hashing, binding resolution, containment checks, state transforms. No `require('electron')`, so Vitest can import it. |
| `frontend/electron/roots.cjs` | **Create.** Stateful: JSON persistence, native picker, `roots_*` IPC handlers, legacy migration. |
| `frontend/electron/fsBridge.cjs` | **Modify.** Drop grant/guard duties; take `ctx` and delegate resolution to `rootsCore`. |
| `frontend/electron/main.cjs` | **Modify.** Register roots IPC; `terminal:exec` takes `ctx`. |
| `frontend/electron/preload.cjs` | **Modify.** Allow `roots_*` commands through the invoke allowlist. |
| `frontend/src/tools/localFs.js` | **Modify.** Inject `ctx` into every invoke; add folder-management helpers; rename `fs_grant` → `fs_add_folder`. |
| `frontend/src/tools/terminalRun.js` | **Modify.** Pass `ctx`. |
| `frontend/src/tools/index.js` | **Modify.** Register `fs_add_folder`. |
| `frontend/src/App.jsx` | **Modify.** Context provider ref, folder popover, draft-chat rebind, system-prompt folder block. |
| `frontend/src/roots.test.js` | **Create.** Unit tests for `rootsCore`. |
| `frontend/src/desktop.test.js` | **Modify.** Bridge-level tests for ctx forwarding. |
| `CLAUDE.md` | **Modify.** Correct the now-false "abs/.. rejected" and "ONE granted root" notes. |

Why the `rootsCore` / `roots` split: `vitest.config.js` restricts tests to `src/**/*.test.{js,jsx}` and runs under jsdom, where `require('electron')` throws. Keeping the logic Electron-free is what makes it testable at all — the same reason `video/timeline.js` and `workflows.js` are pure.

---

## Task 1: Root identity hashing

**Files:**
- Create: `frontend/electron/rootsCore.cjs`
- Create: `frontend/src/roots.test.js`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/roots.test.js`:

```js
import { describe, it, expect } from 'vitest'
import { rootIdFor } from '../electron/rootsCore.cjs'

describe('rootIdFor', () => {
  it('is stable for the same path', () => {
    expect(rootIdFor('/home/user/work')).toBe(rootIdFor('/home/user/work'))
  })

  it('is 12 hex characters', () => {
    expect(rootIdFor('/home/user/work')).toMatch(/^[0-9a-f]{12}$/)
  })

  it('differs for different paths', () => {
    expect(rootIdFor('/home/a')).not.toBe(rootIdFor('/home/b'))
  })

  it('ignores a trailing separator', () => {
    expect(rootIdFor('/home/user/work/')).toBe(rootIdFor('/home/user/work'))
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run from `frontend/`: `npm test roots`
Expected: FAIL — cannot resolve `../electron/rootsCore.cjs`.

- [ ] **Step 3: Write minimal implementation**

Create `frontend/electron/rootsCore.cjs`:

```js
// Pure workspace-root logic. Deliberately imports NO electron: vitest runs these
// under jsdom where require('electron') throws, and this is the security-critical
// half, so it must be unit-testable.

const path = require('path')
const fs = require('fs')
const crypto = require('crypto')

const isWin = process.platform === 'win32'

/** Case-folded on Windows so C:\Work and c:\work are one root. */
function normaliseForId(p) {
  const n = path.resolve(p)
  return isWin ? n.toLowerCase() : n
}

/** Stable short id for a directory, so re-granting reuses the entry. */
function rootIdFor(p) {
  return crypto.createHash('sha256').update(normaliseForId(p)).digest('hex').slice(0, 12)
}

module.exports = { rootIdFor }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test roots`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/electron/rootsCore.cjs frontend/src/roots.test.js
git commit -m "feat(roots): stable root ids, case-folded on Windows"
```

---

## Task 2: Binding resolution (chat → project → default)

**Files:**
- Modify: `frontend/electron/rootsCore.cjs`
- Modify: `frontend/src/roots.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/roots.test.js`:

```js
import { emptyState, resolveRootIds } from '../electron/rootsCore.cjs'

describe('resolveRootIds', () => {
  const state = {
    version: 1,
    roots: { a: { path: '/a' }, b: { path: '/b' }, c: { path: '/c' } },
    bindings: {
      'chat:1': ['a'],
      'project:9': ['b'],
      default: ['c'],
    },
  }

  it('prefers the chat binding', () => {
    expect(resolveRootIds(state, { conversationId: 1, projectId: 9 })).toEqual(['a'])
  })

  it('falls back to the project binding', () => {
    expect(resolveRootIds(state, { conversationId: 2, projectId: 9 })).toEqual(['b'])
  })

  it('falls back to the default binding', () => {
    expect(resolveRootIds(state, { conversationId: 2, projectId: 8 })).toEqual(['c'])
  })

  it('returns empty when nothing is bound', () => {
    expect(resolveRootIds(emptyState(), { conversationId: 1 })).toEqual([])
  })

  it('drops ids that are not in the registry, never widening access', () => {
    const forged = { ...state, bindings: { ...state.bindings, 'chat:1': ['a', 'NOPE'] } }
    expect(resolveRootIds(forged, { conversationId: 1 })).toEqual(['a'])
  })

  it('skips a binding that resolves to nothing real and keeps falling back', () => {
    const stale = { ...state, bindings: { ...state.bindings, 'chat:1': ['GONE'] } }
    expect(resolveRootIds(stale, { conversationId: 1, projectId: 9 })).toEqual(['b'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test roots`
Expected: FAIL — `resolveRootIds is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `frontend/electron/rootsCore.cjs` above `module.exports`:

```js
function emptyState() {
  return { version: 1, roots: {}, bindings: {} }
}

/** Binding keys in precedence order for a call context. */
function bindingKeys(ctx = {}) {
  const keys = []
  if (ctx.conversationId != null && ctx.conversationId !== '') keys.push(`chat:${ctx.conversationId}`)
  if (ctx.projectId != null && ctx.projectId !== '') keys.push(`project:${ctx.projectId}`)
  keys.push('default')
  return keys
}

/**
 * First binding that yields at least one REGISTERED root. Unknown ids are
 * dropped: the registry is the only authority, so a forged or stale id can
 * never widen access.
 */
function resolveRootIds(state, ctx) {
  const st = state || emptyState()
  for (const key of bindingKeys(ctx)) {
    const ids = (st.bindings?.[key] || []).filter(id => !!st.roots?.[id])
    if (ids.length) return ids
  }
  return []
}

function resolveRootPaths(state, ctx) {
  const st = state || emptyState()
  return resolveRootIds(st, ctx).map(id => st.roots[id].path)
}
```

Update the export line:

```js
module.exports = { rootIdFor, emptyState, bindingKeys, resolveRootIds, resolveRootPaths }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test roots`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/electron/rootsCore.cjs frontend/src/roots.test.js
git commit -m "feat(roots): chat -> project -> default binding resolution"
```

---

## Task 3: Containment (`resolveWithin`) — the security core

**Files:**
- Modify: `frontend/electron/rootsCore.cjs`
- Modify: `frontend/src/roots.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/roots.test.js`. These use real directories in the OS temp dir, because the whole point is `realpath` behaviour, which cannot be mocked meaningfully:

```js
import { resolveWithin } from '../electron/rootsCore.cjs'
import os from 'node:os'
import nodePath from 'node:path'
import nodeFs from 'node:fs'

describe('resolveWithin', () => {
  let rootA, rootB, outside

  beforeAll(() => {
    const base = nodeFs.mkdtempSync(nodePath.join(os.tmpdir(), 'yogatik-roots-'))
    rootA = nodePath.join(base, 'rootA')
    rootB = nodePath.join(base, 'rootB')
    outside = nodePath.join(base, 'outside')
    for (const d of [rootA, rootB, outside]) nodeFs.mkdirSync(d, { recursive: true })
    nodeFs.writeFileSync(nodePath.join(rootA, 'same.txt'), 'A')
    nodeFs.writeFileSync(nodePath.join(rootB, 'same.txt'), 'B')
    nodeFs.writeFileSync(nodePath.join(outside, 'secret.txt'), 'S')
  })

  it('throws when no roots are bound', () => {
    expect(() => resolveWithin([], 'a.txt')).toThrow(/no folder granted/i)
  })

  it('resolves a relative path against the primary root', () => {
    const r = resolveWithin([rootA, rootB], 'same.txt')
    expect(r.absolutePath).toBe(nodePath.join(rootA, 'same.txt'))
  })

  it('accepts an absolute path inside a non-primary root', () => {
    const target = nodePath.join(rootB, 'same.txt')
    expect(resolveWithin([rootA, rootB], target).absolutePath).toBe(target)
  })

  it('refuses an absolute path outside every root', () => {
    const target = nodePath.join(outside, 'secret.txt')
    expect(() => resolveWithin([rootA, rootB], target)).toThrow(/outside/i)
  })

  it('refuses a .. escape', () => {
    expect(() => resolveWithin([rootA], nodePath.join('..', 'outside', 'secret.txt'))).toThrow(/outside/i)
  })

  it('allows a path for a file that does not exist yet', () => {
    const r = resolveWithin([rootA], 'nested/new.txt')
    expect(r.absolutePath).toBe(nodePath.join(rootA, 'nested', 'new.txt'))
  })

  it('refuses a symlinked directory that points outside the root', () => {
    const link = nodePath.join(rootA, 'escape')
    try { nodeFs.symlinkSync(outside, link, 'junction') } catch { return } // needs privileges on Windows
    expect(() => resolveWithin([rootA], 'escape/secret.txt')).toThrow(/outside/i)
  })

  it('refuses writing THROUGH a symlink to a file that does not exist yet', () => {
    const link = nodePath.join(rootA, 'escape2')
    try { nodeFs.symlinkSync(outside, link, 'junction') } catch { return }
    expect(() => resolveWithin([rootA], 'escape2/brand-new.txt')).toThrow(/outside/i)
  })
})
```

Add `beforeAll` to the vitest import at the top of the file:

```js
import { describe, it, expect, beforeAll } from 'vitest'
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test roots`
Expected: FAIL — `resolveWithin is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `frontend/electron/rootsCore.cjs`:

```js
function samePath(a, b) {
  return isWin ? a.toLowerCase() === b.toLowerCase() : a === b
}
function isUnder(child, parent) {
  const withSep = parent.endsWith(path.sep) ? parent : parent + path.sep
  return isWin
    ? child.toLowerCase().startsWith(withSep.toLowerCase())
    : child.startsWith(withSep)
}

/** The bound root that contains `abs`, or null. */
function containingRoot(rootPaths, abs) {
  for (const r of rootPaths) {
    const base = path.resolve(r)
    if (samePath(abs, base) || isUnder(abs, base)) return base
  }
  return null
}

/** Nearest ancestor of `p` that exists — the anchor for the symlink re-check. */
function nearestExisting(p) {
  let cur = path.resolve(p)
  for (;;) {
    if (fs.existsSync(cur)) return cur
    const parent = path.dirname(cur)
    if (parent === cur) return cur
    cur = parent
  }
}

/**
 * Resolve `target` inside one of `rootPaths`, or throw.
 *
 * Absolute paths ARE allowed (the model needs to name a file across several
 * roots, as Claude Code does) — safety comes from the containment check, not
 * from banning them. The realpath re-check runs against the nearest EXISTING
 * ancestor, so a symlinked parent cannot be used to create a file outside a
 * root; checking only when the target itself exists was the old gap.
 */
function resolveWithin(rootPaths, target) {
  const roots = (rootPaths || []).filter(Boolean)
  if (!roots.length) throw new Error('no folder granted')

  const primary = path.resolve(roots[0])
  const raw = target == null || target === '' ? '.' : String(target)
  const abs = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(primary, raw)

  const rootPath = containingRoot(roots, abs)
  if (!rootPath) throw new Error(`${raw} is outside this chat's folders`)

  let realProbe
  let realRoot
  try { realProbe = fs.realpathSync(nearestExisting(abs)) } catch { realProbe = nearestExisting(abs) }
  try { realRoot = fs.realpathSync(rootPath) } catch { realRoot = rootPath }

  if (!samePath(realProbe, realRoot) && !isUnder(realProbe, realRoot)) {
    throw new Error(`${raw} is outside this chat's folders`)
  }
  return { absolutePath: abs, rootPath }
}
```

Update the export line:

```js
module.exports = {
  rootIdFor, emptyState, bindingKeys, resolveRootIds, resolveRootPaths,
  containingRoot, resolveWithin,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test roots`
Expected: PASS, 18 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/electron/rootsCore.cjs frontend/src/roots.test.js
git commit -m "feat(roots): containment check across multiple roots

Absolute paths are now allowed when they land inside a bound root.
The realpath re-check anchors on the nearest EXISTING ancestor, closing
the gap where a symlinked parent could be used to write outside a root
via fs_write on a not-yet-existing file."
```

---

## Task 4: State transforms (add / remove / primary / materialise / rebind / migrate)

**Files:**
- Modify: `frontend/electron/rootsCore.cjs`
- Modify: `frontend/src/roots.test.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/roots.test.js`:

```js
import {
  addRoot, removeRoot, setPrimary, materialise, rebindChat, migrateLegacyGrant,
} from '../electron/rootsCore.cjs'

describe('state transforms', () => {
  const ctx = { conversationId: 1, projectId: 9 }

  function seeded() {
    return {
      version: 1,
      roots: { b: { path: '/b', label: 'b', addedAt: 1 } },
      bindings: { 'project:9': ['b'] },
    }
  }

  it('materialise copies an inherited list into an explicit chat binding', () => {
    const next = materialise(seeded(), ctx)
    expect(next.bindings['chat:1']).toEqual(['b'])
    expect(next.bindings['project:9']).toEqual(['b'])
  })

  it('materialise leaves an existing chat binding untouched', () => {
    const st = seeded()
    st.bindings['chat:1'] = []
    expect(materialise(st, ctx).bindings['chat:1']).toEqual([])
  })

  it('addRoot registers the folder and binds it to the chat only', () => {
    const { state, root } = addRoot(seeded(), ctx, '/a')
    expect(root.path).toBe('/a')
    expect(root.label).toBe('a')
    expect(state.roots[root.id]).toBeTruthy()
    expect(state.bindings['chat:1']).toEqual(['b', root.id])
    expect(state.bindings['project:9']).toEqual(['b']) // project default untouched
  })

  it('addRoot is idempotent for the same folder', () => {
    const one = addRoot(seeded(), ctx, '/a')
    const two = addRoot(one.state, ctx, '/a')
    expect(two.state.bindings['chat:1'].filter(id => id === one.root.id)).toHaveLength(1)
  })

  it('removeRoot unbinds from the chat but keeps the registry entry in use elsewhere', () => {
    const st = removeRoot(seeded(), ctx, 'b')
    expect(st.bindings['chat:1']).toEqual([])
    expect(st.roots.b).toBeTruthy()
    expect(st.bindings['project:9']).toEqual(['b'])
  })

  it('setPrimary moves the id to the front of the chat binding', () => {
    const { state, root } = addRoot(seeded(), ctx, '/a')
    const st = setPrimary(state, ctx, root.id)
    expect(st.bindings['chat:1'][0]).toBe(root.id)
  })

  it('rebindChat moves a draft chat binding to its saved id', () => {
    const { state } = addRoot(seeded(), { conversationId: 'c_new_1' }, '/a')
    const st = rebindChat(state, 'c_new_1', 42)
    expect(st.bindings['chat:c_new_1']).toBeUndefined()
    expect(st.bindings['chat:42']).toHaveLength(2)
  })

  it('rebindChat is a no-op when the draft had no binding', () => {
    const st = rebindChat(seeded(), 'c_new_zzz', 42)
    expect(st.bindings['chat:42']).toBeUndefined()
  })

  it('migrateLegacyGrant makes the old single root the default', () => {
    const st = migrateLegacyGrant(emptyState(), '/legacy')
    const id = rootIdFor('/legacy')
    expect(st.roots[id].path).toBe('/legacy')
    expect(st.bindings.default).toEqual([id])
  })

  it('migrateLegacyGrant does nothing without a legacy path', () => {
    expect(migrateLegacyGrant(emptyState(), null)).toEqual(emptyState())
  })

  it('migrateLegacyGrant does not clobber an existing default', () => {
    const st = { ...emptyState(), bindings: { default: ['b'] }, roots: { b: { path: '/b' } } }
    expect(migrateLegacyGrant(st, '/legacy').bindings.default).toEqual(['b'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test roots`
Expected: FAIL — `materialise is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `frontend/electron/rootsCore.cjs`:

```js
function clone(state) {
  const st = state || emptyState()
  return { version: 1, roots: { ...st.roots }, bindings: { ...st.bindings } }
}

function chatKey(ctx) {
  if (ctx?.conversationId == null || ctx.conversationId === '') return null
  return `chat:${ctx.conversationId}`
}

/**
 * Give this chat its OWN binding, seeded from whatever it currently inherits.
 * Every mutation goes through here, so editing one chat's folders can never
 * silently rewrite a project or global default.
 */
function materialise(state, ctx) {
  const st = clone(state)
  const key = chatKey(ctx)
  if (!key) return st
  if (!Array.isArray(st.bindings[key])) st.bindings[key] = resolveRootIds(st, ctx)
  return st
}

function addRoot(state, ctx, absPath) {
  const st = materialise(state, ctx)
  const resolved = path.resolve(absPath)
  const id = rootIdFor(resolved)
  if (!st.roots[id]) {
    st.roots[id] = { path: resolved, label: path.basename(resolved) || resolved, addedAt: Date.now() }
  }
  const key = chatKey(ctx) || 'default'
  const list = st.bindings[key] || []
  st.bindings[key] = list.includes(id) ? list : [...list, id]
  return { state: st, root: { id, ...st.roots[id] } }
}

function removeRoot(state, ctx, rootId) {
  const st = materialise(state, ctx)
  const key = chatKey(ctx) || 'default'
  st.bindings[key] = (st.bindings[key] || []).filter(id => id !== rootId)
  const stillUsed = Object.values(st.bindings).some(list => (list || []).includes(rootId))
  if (!stillUsed) delete st.roots[rootId]
  return st
}

function setPrimary(state, ctx, rootId) {
  const st = materialise(state, ctx)
  const key = chatKey(ctx) || 'default'
  const list = st.bindings[key] || []
  if (!list.includes(rootId)) return st
  st.bindings[key] = [rootId, ...list.filter(id => id !== rootId)]
  return st
}

/** A draft chat has no DB id; move its binding once the chat is saved. */
function rebindChat(state, oldId, newId) {
  const st = clone(state)
  const from = `chat:${oldId}`
  const to = `chat:${newId}`
  if (!st.bindings[from]) return st
  st.bindings[to] = st.bindings[from]
  delete st.bindings[from]
  return st
}

/** The old app-wide granted_folder.txt becomes the global default. */
function migrateLegacyGrant(state, legacyPath) {
  const st = clone(state)
  if (!legacyPath) return st
  if ((st.bindings.default || []).length) return st
  const resolved = path.resolve(legacyPath)
  const id = rootIdFor(resolved)
  st.roots[id] = st.roots[id] || {
    path: resolved, label: path.basename(resolved) || resolved, addedAt: Date.now(),
  }
  st.bindings.default = [id]
  return st
}

/** Drop bindings whose directory has been deleted or unmounted. */
function pruneMissing(state) {
  const st = clone(state)
  const removed = []
  for (const [id, root] of Object.entries(st.roots)) {
    let ok = false
    try { ok = fs.statSync(root.path).isDirectory() } catch { ok = false }
    if (!ok) {
      removed.push({ id, ...root })
      delete st.roots[id]
    }
  }
  if (removed.length) {
    const gone = new Set(removed.map(r => r.id))
    for (const key of Object.keys(st.bindings)) {
      st.bindings[key] = (st.bindings[key] || []).filter(id => !gone.has(id))
    }
  }
  return { state: st, removed }
}
```

Replace the export line with:

```js
module.exports = {
  rootIdFor, emptyState, bindingKeys, resolveRootIds, resolveRootPaths,
  containingRoot, resolveWithin,
  materialise, addRoot, removeRoot, setPrimary, rebindChat, migrateLegacyGrant, pruneMissing,
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test roots`
Expected: PASS, 30 tests.

- [ ] **Step 5: Commit**

```bash
git add frontend/electron/rootsCore.cjs frontend/src/roots.test.js
git commit -m "feat(roots): state transforms with materialisation and legacy migration"
```

---

## Task 5: Persistence + IPC handlers

**Files:**
- Create: `frontend/electron/roots.cjs`

- [ ] **Step 1: Write the implementation**

This module is the Electron-facing shell around `rootsCore`. It has no unit test of its own (it is I/O and `ipcMain` wiring; the logic it calls is covered by Tasks 1–4) and is exercised by the bridge tests in Task 9.

Create `frontend/electron/roots.cjs`:

```js
// Workspace roots: persistence + IPC. All decision logic lives in rootsCore.cjs,
// which imports no electron so it can be unit-tested.

const { app, ipcMain, dialog } = require('electron')
const path = require('path')
const fs = require('fs')
const core = require('./rootsCore.cjs')

let state = core.emptyState()
let getWindow = () => null

function storeFile() { return path.join(app.getPath('userData'), 'workspace_roots.json') }
function legacyFile() { return path.join(app.getPath('userData'), 'granted_folder.txt') }

function save() {
  try { fs.writeFileSync(storeFile(), JSON.stringify(state, null, 2), 'utf8') } catch { /* ignore */ }
}

function load() {
  try {
    const raw = fs.readFileSync(storeFile(), 'utf8')
    const parsed = JSON.parse(raw)
    if (parsed && parsed.roots && parsed.bindings) state = parsed
  } catch { state = core.emptyState() }

  // One-time migration: the old app-wide grant becomes the global default so
  // every existing chat inherits exactly the folder it had before.
  let legacy = null
  try {
    const p = fs.readFileSync(legacyFile(), 'utf8').trim()
    if (p && fs.statSync(p).isDirectory()) legacy = p
  } catch { /* none */ }
  if (legacy) state = core.migrateLegacyGrant(state, legacy)

  const pruned = core.pruneMissing(state)
  state = pruned.state
  save()
  return state
}

/** Absolute paths bound to this call's chat. Empty array when none. */
function rootPathsFor(ctx) { return core.resolveRootPaths(state, ctx) }

/** Resolve a tool-supplied path, or throw. The single guard for all fs ops. */
function resolvePath(ctx, target) {
  return core.resolveWithin(rootPathsFor(ctx), target).absolutePath
}

function listFor(ctx) {
  const ids = core.resolveRootIds(state, ctx)
  const key = ctx?.conversationId != null ? `chat:${ctx.conversationId}` : null
  const source = key && Array.isArray(state.bindings[key])
    ? 'chat'
    : (ctx?.projectId != null && Array.isArray(state.bindings[`project:${ctx.projectId}`]) ? 'project' : 'default')
  return ids.map((id, i) => ({ id, path: state.roots[id].path, label: state.roots[id].label, primary: i === 0, source }))
}

function registerRootsIpc(opts = {}) {
  if (opts.getWindow) getWindow = opts.getWindow
  load()

  ipcMain.handle('roots_add', async (_e, { ctx } = {}) => {
    const res = await dialog.showOpenDialog(getWindow(), { properties: ['openDirectory'] })
    if (res.canceled || !res.filePaths[0]) return null
    const out = core.addRoot(state, ctx, res.filePaths[0])
    state = out.state
    save()
    return out.root
  })

  // Prune here as well as at load: a folder can be deleted or a drive unmounted
  // mid-session, and the popover must stop offering a folder that is gone.
  ipcMain.handle('roots_list', (_e, { ctx } = {}) => {
    const pruned = core.pruneMissing(state)
    if (pruned.removed.length) { state = pruned.state; save() }
    return listFor(ctx)
  })

  ipcMain.handle('roots_remove', (_e, { ctx, rootId } = {}) => {
    state = core.removeRoot(state, ctx, rootId)
    save()
    return listFor(ctx)
  })

  ipcMain.handle('roots_set_primary', (_e, { ctx, rootId } = {}) => {
    state = core.setPrimary(state, ctx, rootId)
    save()
    return listFor(ctx)
  })

  ipcMain.handle('roots_rebind', (_e, { oldId, newId } = {}) => {
    state = core.rebindChat(state, oldId, newId)
    save()
    return true
  })

  // ── Compatibility aliases (one release) so the Tauri shell and any existing
  // caller keep working while src-tauri stays on the single-root model. ──
  ipcMain.handle('fs_grant', async (_e, { ctx } = {}) => {
    const res = await dialog.showOpenDialog(getWindow(), { properties: ['openDirectory'] })
    if (res.canceled || !res.filePaths[0]) return null
    const out = core.addRoot(state, ctx, res.filePaths[0])
    state = out.state
    save()
    return out.root.path
  })
  ipcMain.handle('fs_granted_root', (_e, { ctx } = {}) => rootPathsFor(ctx)[0] || null)
  ipcMain.handle('fs_clear_grant', (_e, { ctx } = {}) => {
    for (const r of listFor(ctx)) state = core.removeRoot(state, ctx, r.id)
    save()
    return null
  })
}

module.exports = { registerRootsIpc, resolvePath, rootPathsFor, load }
```

- [ ] **Step 2: Verify it parses**

Run from `frontend/`: `node --check electron/roots.cjs`
Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add frontend/electron/roots.cjs
git commit -m "feat(roots): persistence, native picker and roots_* IPC"
```

---

## Task 6: Point fsBridge at the new resolver

**Files:**
- Modify: `frontend/electron/fsBridge.cjs`

- [ ] **Step 1: Replace the grant/guard half**

In `frontend/electron/fsBridge.cjs`, delete the `grantedRoot` variable, `grantStore`, `persistGrant`, `loadGrant`, `getGrantedRoot` and `resolveInRoot` (lines 10–49 in the current file), and the `fs_grant` / `fs_granted_root` / `fs_clear_grant` handlers (lines 73–87) — those now live in `roots.cjs`.

Replace the header and imports with:

```js
// Scoped local-filesystem bridge for the Electron main process.
// Path containment and the granted-root registry live in roots.cjs / rootsCore.cjs;
// this file is only the file OPERATIONS. Every handler takes ctx so the folders
// it may touch are the ones bound to that chat.

const { ipcMain } = require('electron')
const path = require('path')
const fs = require('fs')
const { resolvePath, rootPathsFor } = require('./roots.cjs')
```

- [ ] **Step 2: Rewrite each handler to take ctx**

Each handler gains `ctx` and calls `resolvePath(ctx, rel)`. Paths returned to the renderer become absolute. Replace the handler bodies:

```js
function registerFsBridge() {
  ipcMain.handle('fs_list', (_e, { ctx, path: rel = '', recursive = false }) => {
    const dir = resolvePath(ctx, rel || '.')
    const collected = []
    walk(dir, collected, { recursive }, 0)
    return collected.slice(0, 5000).map(({ dirent, full }) => {
      let size = 0
      try { size = fs.statSync(full).size } catch { /* ignore */ }
      return { name: dirent.name, path: full, is_dir: dirent.isDirectory(), size }
    })
  })

  ipcMain.handle('fs_read', async (_e, { ctx, path: rel, maxBytes = 500000 }) => {
    const file = resolvePath(ctx, rel)
    const buf = await fs.promises.readFile(file)
    return buf.slice(0, Math.min(maxBytes, buf.length)).toString('utf8')
  })

  ipcMain.handle('fs_write', async (_e, { ctx, path: rel, content }) => {
    const file = resolvePath(ctx, rel)
    await fs.promises.mkdir(path.dirname(file), { recursive: true })
    await fs.promises.writeFile(file, content ?? '', 'utf8')
    return null
  })

  ipcMain.handle('fs_edit', async (_e, { ctx, path: rel, oldString, newString, replaceAll }) => {
    const file = resolvePath(ctx, rel)
    const text = await fs.promises.readFile(file, 'utf8')
    const count = text.split(oldString).length - 1
    if (count === 0) throw new Error('old_string not found')
    if (count > 1 && !replaceAll) {
      throw new Error(`old_string is not unique (${count} matches); set replace_all or add more context`)
    }
    const updated = replaceAll
      ? text.split(oldString).join(newString ?? '')
      : text.replace(oldString, newString ?? '')
    await fs.promises.writeFile(file, updated, 'utf8')
    return replaceAll ? count : 1
  })

  // Searches EVERY folder bound to this chat, not just the primary.
  ipcMain.handle('fs_search', async (_e, { ctx, query, glob = '', regex = false, maxResults = 100 }) => {
    const roots = rootPathsFor(ctx)
    if (!roots.length) throw new Error('no folder granted')
    const nameRe = glob.trim() ? globToRegExp(glob.trim()) : null
    const re = regex ? new RegExp(query) : null
    const out = []
    for (const root of roots) {
      const all = []
      walk(root, all, { recursive: true }, 0)
      for (const { dirent, full } of all) {
        if (!dirent.isFile()) continue
        if (nameRe && !nameRe.test(dirent.name)) continue
        let text
        try { text = await fs.promises.readFile(full, 'utf8') } catch { continue }
        const lines = text.split(/\r?\n/)
        for (let i = 0; i < lines.length; i++) {
          const hit = re ? re.test(lines[i]) : lines[i].includes(query)
          if (hit) {
            out.push({ path: full, line: i + 1, text: lines[i].slice(0, 400) })
            if (out.length >= maxResults) return out
          }
        }
      }
    }
    return out
  })

  ipcMain.handle('fs_delete', async (_e, { ctx, path: rel, recursive = false }) => {
    const target = resolvePath(ctx, rel)
    if (rootPathsFor(ctx).some(r => path.resolve(r) === target)) {
      throw new Error('Deleting the root of a granted folder is not allowed.')
    }
    let stat
    try { stat = await fs.promises.stat(target) }
    catch (e) {
      if (e.code === 'ENOENT') throw new Error(`File not found: ${rel}`)
      throw e
    }
    if (stat.isDirectory()) {
      if (recursive) await fs.promises.rm(target, { recursive: true, force: true })
      else await fs.promises.rmdir(target)
    } else {
      await fs.promises.unlink(target)
    }
    return null
  })

  ipcMain.handle('fs_mkdir', async (_e, { ctx, path: rel }) => {
    await fs.promises.mkdir(resolvePath(ctx, rel), { recursive: true })
    return null
  })

  ipcMain.handle('fs_move', async (_e, { ctx, src, dest }) => {
    const srcPath = resolvePath(ctx, src)
    const destPath = resolvePath(ctx, dest)
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
    await fs.promises.rename(srcPath, destPath)
    return null
  })
}

module.exports = { registerFsBridge }
```

Keep the existing `globToRegExp` and `walk` helpers unchanged.

- [ ] **Step 3: Verify it parses**

Run: `node --check electron/fsBridge.cjs`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add frontend/electron/fsBridge.cjs
git commit -m "refactor(fs): fsBridge does file ops only; roots.cjs owns containment"
```

---

## Task 7: Wire main process + preload

**Files:**
- Modify: `frontend/electron/main.cjs`
- Modify: `frontend/electron/preload.cjs`

- [ ] **Step 1: Update main.cjs imports and registration**

Replace the `fsBridge` import (currently line 12) with:

```js
const { registerFsBridge } = require('./fsBridge.cjs')
const { registerRootsIpc, rootPathsFor, resolvePath } = require('./roots.cjs')
```

Replace the `registerFsBridge({ getWindow })` call on line 148 and **delete the
`loadGrant()` call on line 150** — `roots.cjs`'s own `load()` (called inside
`registerRootsIpc`) replaces it, and leaving the call behind is a `ReferenceError` at
startup because the import is gone. `registerRootsIpc` must run **first**: it loads the
state that `fsBridge` resolves against.

```js
    registerRootsIpc({ getWindow })
    registerFsBridge()
```

`buildMenu` currently passes `getRoot: getGrantedRoot`. Replace that argument with a context-free lookup of the global default, since the native menu has no chat context:

```js
buildMenu(mainWindow, {
  getRoot: () => rootPathsFor({})[0] || null,
  onCheckUpdates: () => checkForUpdates(() => mainWindow),
})
```

- [ ] **Step 2: Update terminal:exec to take ctx**

Replace the guard block added earlier in `terminal:exec` with:

```js
    ipcMain.handle('terminal:exec', async (_, { ctx, command, cwd, timeout = 30000 }) => {
      // A folder must be bound to THIS chat — never fall back to the app's own
      // install directory, and never run in another chat's folder.
      const roots = rootPathsFor(ctx)
      if (!roots.length) {
        return { success: false, exitCode: -1, stdout: '', stderr: 'No working folder for this chat. Ask the user to add one.', killed: false }
      }
      let workingDir
      try {
        workingDir = resolvePath(ctx, cwd || '.')
      } catch (e) {
        return { success: false, exitCode: -1, stdout: '', stderr: `Invalid working directory: ${e.message}`, killed: false }
      }
```

Leave the rest of the handler (the `spawn` promise) exactly as it is.

- [ ] **Step 3: Allow the new commands through preload**

In `frontend/electron/preload.cjs`, replace the `FS_COMMANDS` set:

```js
const FS_COMMANDS = new Set([
  'fs_grant', 'fs_granted_root', 'fs_clear_grant',
  'fs_list', 'fs_read', 'fs_write', 'fs_edit', 'fs_search',
  'fs_delete', 'fs_mkdir', 'fs_move',
  'roots_add', 'roots_list', 'roots_remove', 'roots_set_primary', 'roots_rebind',
])
```

- [ ] **Step 4: Verify both parse**

Run: `node --check electron/main.cjs && node --check electron/preload.cjs`
Expected: no output.

- [ ] **Step 5: Commit**

```bash
git add frontend/electron/main.cjs frontend/electron/preload.cjs
git commit -m "feat(roots): register roots IPC, scope terminal:exec per chat"
```

---

## Task 8: Renderer context injection + folder tools

**Files:**
- Modify: `frontend/src/tools/localFs.js`
- Modify: `frontend/src/tools/terminalRun.js`
- Modify: `frontend/src/tools/index.js`

- [ ] **Step 1: Write the failing test**

Append to `frontend/src/desktop.test.js`, inside the existing `describe('local filesystem tools (desktop bridge)')` block:

```js
  describe('workspace context injection', () => {
    let seen

    beforeEach(() => {
      seen = []
      globalThis.window = {
        __TAURI__: {
          core: {
            invoke: async (cmd, args) => {
              seen.push({ cmd, args })
              if (cmd === 'fs_read') return 'ok'
              if (cmd === 'roots_list') return [{ id: 'r1', path: '/w/repo', label: 'repo', primary: true, source: 'chat' }]
              return null
            },
          },
        },
      }
    })

    it('injects the active chat context into every fs call', async () => {
      const { setWorkspaceContext } = await import('./tools/localFs')
      setWorkspaceContext(() => ({ conversationId: 7, projectId: 3 }))
      await fsReadTool.execute({ path: 'a.txt' })
      expect(seen[0].args.ctx).toEqual({ conversationId: 7, projectId: 3 })
    })

    it('never exposes ctx as a tool parameter the model can set', () => {
      expect(Object.keys(fsReadTool.schema.parameters.properties)).not.toContain('ctx')
    })

    it('listRoots returns the folders bound to the chat', async () => {
      const { listRoots, setWorkspaceContext } = await import('./tools/localFs')
      setWorkspaceContext(() => ({ conversationId: 7, projectId: null }))
      const roots = await listRoots()
      expect(roots).toHaveLength(1)
      expect(roots[0].path).toBe('/w/repo')
    })
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test desktop`
Expected: FAIL — `setWorkspaceContext is not a function`.

- [ ] **Step 3: Implement context injection in localFs.js**

In `frontend/src/tools/localFs.js`, replace the `invoke` helper and the UI helper block (current lines 17–58) with:

```js
// The active chat supplies the context for every call. It is injected here, NOT
// exposed as a tool parameter — the model must never be able to name another
// chat's folders. App.jsx installs a getter that reads from a ref, because
// reading React state directly here would capture a stale closure.
let ctxProvider = () => ({ conversationId: null, projectId: null })

export function setWorkspaceContext(fn) {
  ctxProvider = typeof fn === 'function' ? fn : () => ({ conversationId: null, projectId: null })
}

function workspaceCtx() {
  try { return ctxProvider() || {} } catch { return {} }
}

async function invoke(cmd, args) {
  const core = window.__TAURI__?.core
  if (!core?.invoke) throw new Error('Tauri bridge unavailable')
  return core.invoke(cmd, { ...(args || {}), ctx: workspaceCtx() })
}

/** UI helpers (desktop only) — manage this chat's working folders. */
export async function addRoot() {
  if (!isDesktop()) return null
  try { return await invoke('roots_add') } catch { return null }
}
export async function listRoots() {
  if (!isDesktop()) return []
  try { return (await invoke('roots_list')) || [] } catch { return [] }
}
export async function removeRoot(rootId) {
  if (!isDesktop()) return []
  try { return (await invoke('roots_remove', { rootId })) || [] } catch { return [] }
}
export async function setPrimaryRoot(rootId) {
  if (!isDesktop()) return []
  try { return (await invoke('roots_set_primary', { rootId })) || [] } catch { return [] }
}
/** A draft chat has no DB id; move its folders across once it is saved. */
export async function rebindChatRoots(oldId, newId) {
  if (!isDesktop() || oldId == null || newId == null) return
  try { await invoke('roots_rebind', { oldId, newId }) } catch { /* ignore */ }
}
```

- [ ] **Step 4: Rename the grant tool and update descriptions**

Replace `fsGrantTool` in `frontend/src/tools/localFs.js` with:

```js
export const fsAddFolderTool = {
  schema: {
    description:
      'Open a native folder picker so the user grants this chat access to a folder on their computer. ' +
      'A chat may hold several folders. Call this when no folder is granted yet, or when the user ' +
      'asks to work somewhere new. Reads and writes are confined to this chat\u2019s folders. Desktop app only.',
    parameters: { type: 'object', properties: {}, required: [] },
  },
  async execute() {
    if (!isDesktop()) return DESKTOP_ONLY
    try {
      const root = await invoke('roots_add')
      if (!root) return { success: false, error: 'User cancelled the folder picker.' }
      return ok({ tool: 'fs_add_folder', root: root.path, message: `Added working folder ${root.path}` })
    } catch (e) { return fail(e) }
  },
}

// Kept so existing callers and the Tauri shell keep working for one release.
export const fsGrantTool = fsAddFolderTool
```

Update the `guard` helper's no-folder message so it is actionable by the model:

```js
    if (/no folder granted|not granted/i.test(msg)) {
      return { success: false, error: 'No working folder for this chat. Call fs_add_folder so the user can pick one.' }
    }
```

Update the path descriptions in `fsListTool`, `fsReadTool`, `fsWriteTool`, `fsEditTool`, `fsDeleteTool`, `fsMkdirTool` and `fsMoveTool` — replace every occurrence of the phrase `inside the granted folder` with `absolute, or relative to this chat\u2019s primary folder`, and in `fsListTool` change `"" or "." for the root` to `"" or "." for the primary folder`.

- [ ] **Step 5: Pass ctx from the terminal tool**

In `frontend/src/tools/terminalRun.js`, replace the `execute` body's invoke line:

```js
      const res = await window.__YOGATIK_TERMINAL__.exec(command, { cwd, timeout, ctx: getWorkspaceCtx() })
```

and add at the top of the file:

```js
import { isDesktop, getWorkspaceCtx } from './localFs'
```

Export the getter from `localFs.js` next to `setWorkspaceContext`:

```js
export function getWorkspaceCtx() { return workspaceCtx() }
```

Update the tool description to name the folder scope:

```js
      'Execute a terminal CLI command in this chat\u2019s primary working folder. ' +
```

- [ ] **Step 6: Register the renamed tool**

In `frontend/src/tools/index.js`, change the import on line 59 from `fsGrantTool` to `fsAddFolderTool`, and replace the registry entry on line 137:

```js
  fs_add_folder: fsAddFolderTool,
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `npm test desktop`
Expected: PASS. The three pre-existing `fs_grant` tests still pass through the alias.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/tools/localFs.js frontend/src/tools/terminalRun.js frontend/src/tools/index.js frontend/src/desktop.test.js
git commit -m "feat(fs): per-chat workspace context on every tool call"
```

---

## Task 9: App.jsx — context provider, folder popover, draft rebind

**Files:**
- Modify: `frontend/src/App.jsx`

- [ ] **Step 1: Install the context provider**

Replace the import on line 5:

```js
import { isDesktop, addRoot, listRoots, removeRoot, setPrimaryRoot, rebindChatRoots, setWorkspaceContext } from './tools/localFs'
```

Replace the `grantedRoot` state declaration on line 142 with a list:

```js
  const [chatRoots, setChatRoots] = useState([])
  const [rootsOpen, setRootsOpen] = useState(false)
```

Add a ref-backed context provider. It must read from a ref, not from state: `CLAUDE.md` records that reading React state from callbacks here produced stale-closure bugs three times.

```js
  // Workspace context for the fs_* tools. Ref-backed and assigned during render
  // (not in an effect) so a tool call fired on the first prompt of a brand-new
  // chat still sees the right conversation — the same fix as sendRef.
  const wsCtxRef = useRef({ conversationId: null, projectId: null })
  wsCtxRef.current = {
    conversationId: conv?.id ?? conv?.clientId ?? null,
    projectId: activeProject ?? null,
  }
  useEffect(() => { setWorkspaceContext(() => wsCtxRef.current) }, [])
```

Place this immediately after `const conv = conversations[activeIdx]` (line 263) so `conv` is defined.

- [ ] **Step 2: Load this chat's folders when the chat changes**

Replace the `getGrantedRoot().then(setGrantedRoot)` effect (line 559) with:

```js
  useEffect(() => {
    if (!isDesktop()) return
    listRoots().then(setChatRoots).catch(() => setChatRoots([]))
  }, [conv?.id, conv?.clientId, activeProject])
```

- [ ] **Step 3: Replace the grant handler**

Replace `handleGrantFolder` (lines 153–156):

```js
  const handleAddFolder = useCallback(async () => {
    const added = await addRoot()
    if (added) setChatRoots(await listRoots())
  }, [])
  const handleRemoveFolder = useCallback(async (rootId) => {
    setChatRoots(await removeRoot(rootId))
  }, [])
  const handleMakePrimary = useCallback(async (rootId) => {
    setChatRoots(await setPrimaryRoot(rootId))
  }, [])
```

- [ ] **Step 4: Rebind a draft chat's folders once it is saved**

In `send()`, immediately after the `createConversation` call (line 1202), add:

```js
        if (targetClientId) await rebindChatRoots(targetClientId, convId)
```

- [ ] **Step 5: Update the system-prompt folder block**

Replace the `folderCtx` block (lines 1037–1050) with:

```js
    const folderCtx = chatRoots.length
      ? `\n\nWORKING FOLDERS FOR THIS CHAT:\n` +
        chatRoots.map(r => `- ${r.path}${r.primary ? '  (primary)' : ''}`).join('\n') +
        `\nYou have full file-system access to these folders via the fs_* tools. ` +
        `Use them proactively when the user asks to create, read, edit, rename, move, delete files or directories:\n` +
        `- fs_list   → list contents\n` +
        `- fs_read   → read a file\n` +
        `- fs_write  → create or overwrite a file\n` +
        `- fs_edit   → patch a file by exact string replacement\n` +
        `- fs_search → grep across every folder above\n` +
        `- fs_delete → delete a file or empty directory\n` +
        `- fs_mkdir  → create a directory tree\n` +
        `- fs_move   → move or rename a file/directory\n` +
        `- fs_add_folder → ask the user to grant another folder\n` +
        `Paths may be absolute, or relative to the primary folder. ` +
        `Anything outside these folders is refused.`
      : ''
```

Update the memo dependency on line 1073 from `grantedRoot` to `chatRoots`.

- [ ] **Step 6: Replace the header chip with a popover**

Replace the `desktop-folder-indicator` block (lines 2174–2189):

```jsx
            {isDesktop() && (
              <div className="desktop-folder-indicator" style={{ position: 'relative', display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, marginRight: 8, color: 'var(--text-secondary)' }}>
                <Folder size={15} />
                <button
                  className="small-btn"
                  style={{ padding: '2px 8px', fontSize: 11, maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  onClick={() => setRootsOpen(o => !o)}
                  title={chatRoots.length ? chatRoots.map(r => r.path).join('\n') : 'No working folder for this chat'}
                >
                  {chatRoots.length === 0
                    ? 'No folder'
                    : `${chatRoots[0].label}${chatRoots.length > 1 ? ` +${chatRoots.length - 1}` : ''}`}
                </button>
                {rootsOpen && (
                  <div className="roots-popover" role="dialog" aria-label="Working folders for this chat">
                    <div className="roots-popover-title">Folders for this chat</div>
                    {chatRoots.length === 0 && <div className="roots-empty">No folder yet.</div>}
                    {chatRoots.map(r => (
                      <div key={r.id} className="roots-row">
                        <span className="roots-path" title={r.path}>{r.path}</span>
                        {r.primary
                          ? <span className="roots-badge">primary</span>
                          : <button className="small-btn" onClick={() => handleMakePrimary(r.id)}>Make primary</button>}
                        <button className="icon-btn" aria-label={`Remove ${r.label}`} onClick={() => handleRemoveFolder(r.id)}><Trash2 size={12} /></button>
                      </div>
                    ))}
                    {chatRoots.length > 0 && chatRoots[0].source !== 'chat' && (
                      <div className="roots-inherited">Inherited from {chatRoots[0].source}. Changing them here affects only this chat.</div>
                    )}
                    <button className="small-btn" onClick={handleAddFolder}>Add folder…</button>
                  </div>
                )}
              </div>
            )}
```

- [ ] **Step 7: Confirm there is no menu subscriber to update**

`CLAUDE.md` claims "preload `__YOGATIK_MENU__.on(cb)` relays the action; App.jsx subscribes
→ newChat/setSettingsOpen/pickWorkFolder". **That subscriber does not exist** — `grep -r
__YOGATIK_MENU__ frontend/src` returns nothing, so the native menu's File → Grant Working
Folder item is currently dead. Do not go looking for it.

Verify, then move on:

Run: `grep -rn "__YOGATIK_MENU__" frontend/src`
Expected: no matches.

Wiring the menu up is out of scope for this plan; Task 10 corrects the false claim in
`CLAUDE.md` instead.

- [ ] **Step 8: Add popover styles**

Append to `frontend/src/styles.css`:

```css
.roots-popover {
  position: absolute; top: 100%; right: 0; margin-top: 6px; z-index: 40;
  min-width: 320px; max-width: 460px; padding: 10px;
  background: var(--bg-elevated, #12161f); color: var(--text-primary);
  border: 1px solid var(--border, #2a3140); border-radius: 10px;
  box-shadow: 0 10px 30px rgba(0,0,0,.35);
  display: flex; flex-direction: column; gap: 8px;
}
.roots-popover-title { font-weight: 600; font-size: 12px; }
.roots-empty, .roots-inherited { font-size: 11px; color: var(--text-secondary); }
.roots-row { display: flex; align-items: center; gap: 6px; }
.roots-path {
  flex: 1; font-size: 11px; overflow: hidden; text-overflow: ellipsis;
  white-space: nowrap; direction: rtl; text-align: left;
}
.roots-badge {
  font-size: 10px; padding: 1px 6px; border-radius: 999px;
  background: var(--accent-soft, #23304a); color: var(--text-secondary);
}
@media (max-width: 768px) { .roots-popover { position: fixed; left: 8px; right: 8px; min-width: 0; } }
```

- [ ] **Step 9: Run the full suite**

Run: `npm test`
Expected: PASS. `smoke.test.jsx` must still mount `<App/>` — if it fails, the cause is a missing import (`Trash2` is already imported for the project delete button; confirm `Folder` still is too).

- [ ] **Step 10: Commit**

```bash
git add frontend/src/App.jsx frontend/src/styles.css
git commit -m "feat(ui): per-chat working-folder popover"
```

---

## Task 10: Documentation

**Files:**
- Modify: `CLAUDE.md`

- [ ] **Step 1: Correct the stale notes**

In the "Desktop app — Electron" section, replace the `fsBridge.cjs` description:

```
- Modular main process: electron/main.cjs (thin orchestrator) + roots.cjs/rootsCore.cjs (per-chat
  working folders: registry of user-granted dirs + chat:/project:/default bindings; rootsCore is
  electron-free so it is unit-tested) + fsBridge.cjs (fs_* file ops only, every call carries
  ctx={conversationId,projectId}) + cors.cjs + menu.cjs + windowState.cjs.
```

In the "Desktop app (Tauri v2)" section, change "ONE granted root" to "ONE granted root (Tauri shell only — the Electron shell is per-chat, see above)".

Delete the false claim that the renderer subscribes to the native menu. The current text
reads "preload `__YOGATIK_MENU__.on(cb)` relays the action; App.jsx subscribes →
newChat/setSettingsOpen/pickWorkFolder". Replace it with:

```
  preload exposes __YOGATIK_MENU__.on(cb) to relay the action, but NOTHING in the renderer
  subscribes yet — the File menu's New Chat / Settings / Grant Working Folder items are
  currently inert. Wiring them up is open work.
```

Add to the Gotchas section:

```
- Working folders are PER CHAT on Electron (v3.9). Absolute paths are allowed now — safety is the
  realpath containment check against that chat's bound roots, not a ban on absolute paths. The
  realpath re-check anchors on the nearest EXISTING ancestor: checking only when the target already
  existed let a symlinked parent be used to fs_write outside a root.
- The renderer NEVER sends a filesystem path as "the root". It sends an opaque conversationId and
  main looks up the binding. Model output influences the renderer, so a renderer-supplied root would
  make the grant meaningless.
- terminal:exec requires a folder bound to the calling chat; it must never fall back to process.cwd(),
  which is the app's own install directory.
```

Update the test count line to match the actual number printed by `npm test`.

- [ ] **Step 2: Run the full suite one last time**

Run: `npm test`
Expected: PASS, no failures. Record the total.

- [ ] **Step 3: Lint**

Run: `npx eslint@9 src/tools/localFs.js src/tools/terminalRun.js src/App.jsx`
Expected: no errors. (Requires `npm install` in this worktree first; `CLAUDE.md` notes lint has caught real ReferenceErrors twice that the build did not.)

- [ ] **Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: per-chat working folders, corrected fs guard notes"
```

---

## Manual verification

The unit tests cover resolution and containment, but the picker, persistence and IPC are only exercised by running the app:

- [ ] `npm run electron:build`, launch the `.exe`
- [ ] Chat A: add folder `X`. Chat B (new): shows the inherited default, not `X`
- [ ] Chat B: add folder `Y`; chat A still shows only `X`
- [ ] Chat A: `fs_write` a file → lands in `X`; `terminal_run` `cd` → runs in `X`
- [ ] Chat A: add a second folder `Z`, make it primary, confirm relative writes move to `Z`
- [ ] Ask the model to read an absolute path outside every folder → refused with the "outside this chat's folders" message
- [ ] Restart the app → both chats still have their folders
- [ ] Upgrade path: with an existing `granted_folder.txt`, every pre-existing chat shows that folder as inherited

---

## Out of scope

Multi-window (sub-project 2). Because main resolves roots from `conversationId` and never from the sender `BrowserWindow`, no IPC in this plan needs to change for it. That cycle covers window lifecycle, cross-window Dexie sync, and menu/tray targeting.
