// @vitest-environment node
/**
 * The Electron fs_codebase_map handler, driven against REAL directories
 * through the REAL roots registry and the REAL fsIndex walker — same harness
 * electronFsBridge.test.js established (Module._load patched so this file's
 * own require('electron') and roots.cjs's/fsIndex's reach the stub, not a
 * PATH STRING outside a real Electron runtime).
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach, vi } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import Module from 'node:module'
import { createRequire } from 'node:module'

const require_ = createRequire(import.meta.url)
const electronStub = require_('../test/electron-stub.cjs')
const originalLoad = Module._load
Module._load = function patched(request, parent, isMain) {
  if (request === 'electron') return electronStub
  return originalLoad.call(this, request, parent, isMain)
}

let dirA, dirB, handlers, codebaseMap

function idFor(root) {
  const abs = path.resolve(root)
  return crypto.createHash('sha256')
    .update(path.sep === '\\' ? abs.toLowerCase() : abs)
    .digest('hex').slice(0, 12)
}

/** Bind one or more roots to the `default` chat binding, the way roots.cjs
 *  persists it — same helper electronFsBridge.test.js uses, extended to
 *  accept several roots so a chat can hold multiple folders (CLAUDE.md:
 *  "a chat may hold SEVERAL folders"). */
function seedWorkspaceRegistry(...roots) {
  const userData = path.join(os.tmpdir(), 'yogatik-electron-stub', 'userData')
  fs.mkdirSync(userData, { recursive: true })
  const entries = {}
  const ids = []
  for (const root of roots) {
    const id = idFor(root)
    entries[id] = { path: root }
    ids.push(id)
  }
  fs.writeFileSync(
    path.join(userData, 'workspace_roots.json'),
    JSON.stringify({ version: 1, roots: entries, bindings: { default: ids } }),
  )
}

const call = (args) => handlers.get('fs_codebase_map')({}, { ctx: { conversationId: 'c1' }, ...args })

beforeAll(async () => {
  dirA = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'yogatik-map-a-')))
  dirB = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'yogatik-map-b-')))

  fs.mkdirSync(path.join(dirA, 'src'), { recursive: true })
  fs.mkdirSync(path.join(dirA, 'node_modules', 'junk'), { recursive: true })
  // Two DIFFERENT roots, each with a file at the SAME relative path — the
  // exact case that broke before the explicit absoluteFor map: a shared
  // displayed path is ambiguous unless the resolver remembers which root's
  // walk actually produced it.
  fs.writeFileSync(path.join(dirA, 'src', 'a.js'), 'export function fromRootA() {}\n')
  fs.writeFileSync(path.join(dirA, 'node_modules', 'junk', 'index.js'), 'export function shouldBeIgnored() {}\n')

  fs.mkdirSync(path.join(dirB, 'src'), { recursive: true })
  fs.writeFileSync(path.join(dirB, 'src', 'a.js'), 'export function fromRootB() {}\n')
  fs.writeFileSync(path.join(dirB, 'src', 'b.py'), 'def helper():\n    pass\n')

  seedWorkspaceRegistry(dirA, dirB)

  // require, not import — same reasoning as electronFsBridge.test.js: this
  // module's own require('electron')/roots.cjs must resolve through Node's
  // CJS loader (which Module._load is patched for), not a second ESM copy.
  const roots = require_('../electron/roots.cjs')
  roots.load()
  codebaseMap = require_('../electron/codebaseMap.cjs')
  codebaseMap.registerCodebaseMap()
  handlers = globalThis.__IPC_HANDLERS__
})

afterAll(() => {
  Module._load = originalLoad
  try { fs.rmSync(dirA, { recursive: true, force: true }) } catch { /* best effort */ }
  try { fs.rmSync(dirB, { recursive: true, force: true }) } catch { /* best effort */ }
})

describe('fs_codebase_map', () => {
  it('is registered as an IPC handler', () => {
    expect(handlers.has('fs_codebase_map')).toBe(true)
  })

  it('maps both bound roots and disambiguates a same-named file in each', async () => {
    const res = await call({})
    expect(res.text).toContain('fromRootA')
    expect(res.text).toContain('fromRootB')
    expect(res.text).toContain('helper') // src/b.py, only in root B
    expect(res.text).not.toContain('shouldBeIgnored') // node_modules pruned
  })

  it('caches the result and marks the second call as cached', async () => {
    const first = await call({ forceRefresh: true })
    expect(first.cached).toBe(false)
    const second = await call({})
    expect(second.cached).toBe(true)
    expect(second.text).toBe(first.text)
  })

  it('invalidate() drops the cache so an edit is picked up on the next call', async () => {
    await call({ forceRefresh: true }) // warm the cache
    fs.writeFileSync(path.join(dirA, 'src', 'a.js'), 'export function afterEdit() {}\n')
    codebaseMap.invalidate(path.join(dirA, 'src', 'a.js'))
    const res = await call({})
    expect(res.cached).toBe(false)
    expect(res.text).toContain('afterEdit')
    expect(res.text).not.toContain('fromRootA')
  })

  it('a `path` scopes the map to one subtree of the primary root', async () => {
    const res = await call({ path: 'src', forceRefresh: true })
    // Root A's src/a.js after the previous test's edit.
    expect(res.text).toContain('afterEdit')
    // Displayed paths are prefixed back with the subtree so they still read
    // as real workspace-relative paths, not bare basenames.
    expect(res.text).toMatch(/^src\/a\.js/m)
  })

  it('falls back to the default file cap instead of reading nothing for maxFiles:0', async () => {
    // Same "bad input clamps to the safe end" rule agentPool's concurrency
    // config already follows — 0 must not become "cap the walk at zero files".
    const res = await call({ maxFiles: 0, forceRefresh: true })
    expect(res.mappedFiles).toBeGreaterThan(0)
  })
})

describe('invalidateAndRewarm (background pre-warm, the watcher\'s path)', () => {
  beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }) })
  afterEach(() => { vi.useRealTimers() })

  it('never schedules a rewarm for a change outside every cached root-set', () => {
    codebaseMap.invalidate() // start from a clean cache
    codebaseMap.invalidateAndRewarm('/nowhere/never-granted/file.js')
    expect(codebaseMap._pendingRewarm.size).toBe(0)
  })

  it('drops the stale entry immediately and rebuilds it after the debounce settles', async () => {
    // Warm the cache for real first (fake timers are not active yet for this
    // part — building the map does not go through setTimeout at all).
    vi.useRealTimers()
    await call({ forceRefresh: true })
    expect(codebaseMap._cache.size).toBeGreaterThan(0)
    vi.useFakeTimers({ shouldAdvanceTime: true })

    fs.writeFileSync(path.join(dirB, 'src', 'a.js'), 'export function rewarmed() {}\n')
    codebaseMap.invalidateAndRewarm(path.join(dirB, 'src', 'a.js'))

    // Stale entry gone AT ONCE — a caller must never see the old content
    // while a rebuild is only pending.
    expect(codebaseMap._cache.size).toBe(0)
    expect(codebaseMap._pendingRewarm.size).toBe(1)

    await vi.advanceTimersByTimeAsync(4100)

    expect(codebaseMap._pendingRewarm.size).toBe(0)
    expect(codebaseMap._cache.size).toBeGreaterThan(0)
    const rebuilt = [...codebaseMap._cache.values()][0]
    expect(rebuilt.result.text).toContain('rewarmed')
  })
})
