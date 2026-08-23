// @vitest-environment node
/**
 * The Electron fs_* handlers, driven against a REAL directory through the REAL
 * roots registry.
 *
 * Everything behind `require('electron')` used to be reachable only from the
 * Electron browser harness. That is why fs_find_files could be registered,
 * aliased five ways and scored 210 for "find files" while having no IPC handler
 * at all: the renderer quietly fell back to a recursive fs_list, reported
 * directories as matching files, and nothing failed. vitest.config.js aliases
 * `electron` to test/electron-stub.cjs so these handlers can be called directly.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import Module from 'node:module'
import { createRequire } from 'node:module'

// Vitest hands .cjs files to Node's own CJS loader, so neither vi.mock nor a
// Vite alias reaches their require('electron'). Patching Module._load does, and
// it keeps the whole arrangement inside this file instead of in the shared
// config. (The real package resolves to a PATH STRING outside an Electron
// runtime, so even where it is installed the destructured API is undefined.)
const require_ = createRequire(import.meta.url)
const electronStub = require_('../test/electron-stub.cjs')
const originalLoad = Module._load
Module._load = function patched(request, parent, isMain) {
  if (request === 'electron') return electronStub
  return originalLoad.call(this, request, parent, isMain)
}

let dir
let handlers

/** The registry is the only authority for what a chat may touch — seed it the
 *  way the app would, rather than stubbing the resolver away. */
function seedWorkspaceRegistry(root) {
  const userData = path.join(os.tmpdir(), 'yogatik-electron-stub', 'userData')
  fs.mkdirSync(userData, { recursive: true })
  // Windows ids are case-folded (rootsCore.normaliseForId). path.sep tells us
  // which platform we are on without reaching for `process`, which the shared
  // browser-env lint rules do not define.
  const abs = path.resolve(root)
  const id = crypto.createHash('sha256')
    .update(path.sep === '\\' ? abs.toLowerCase() : abs)
    .digest('hex').slice(0, 12)
  fs.writeFileSync(
    path.join(userData, 'workspace_roots.json'),
    JSON.stringify({ version: 1, roots: { [id]: { path: root } }, bindings: { default: [id] } }),
  )
}

const call = (name, args) => handlers.get(name)({}, { ctx: { conversationId: 'c1' }, ...args })

beforeAll(async () => {
  dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'yogatik-fs-')))
  fs.mkdirSync(path.join(dir, 'src', 'components'), { recursive: true })
  fs.mkdirSync(path.join(dir, 'node_modules', 'junk'), { recursive: true })
  fs.writeFileSync(path.join(dir, 'package.json'), '{"name":"probe"}')
  fs.writeFileSync(path.join(dir, 'src', 'app.jsx'), 'export const App = 1\n')
  fs.writeFileSync(path.join(dir, 'src', 'util.js'), 'export const NEEDLE = 42\n')
  fs.writeFileSync(path.join(dir, 'src', 'components', 'Card.jsx'), 'export const Card = 2\n')
  fs.writeFileSync(path.join(dir, 'node_modules', 'junk', 'index.jsx'), 'module.exports = 3\n')

  seedWorkspaceRegistry(dir)

  // require, not import: fsBridge.cjs pulls roots.cjs through Node's CJS loader,
  // and an ESM import here would create a SECOND copy with its own (unloaded)
  // state — the handlers would then report "no folder granted".
  const roots = require_('../electron/roots.cjs')
  roots.load()
  const { registerFsBridge } = require_('../electron/fsBridge.cjs')
  registerFsBridge()
  handlers = globalThis.__IPC_HANDLERS__
})

afterAll(() => {
  Module._load = originalLoad
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* best effort */ }
})

describe('fs_find_files', () => {
  it('is registered as an IPC handler at all', () => {
    // The original bug: tool, aliases and ranking existed; the handler did not.
    expect(handlers.has('fs_find_files')).toBe(true)
  })

  it('finds files by extension and returns only FILES', async () => {
    const hits = await call('fs_find_files', { extension: 'jsx' })
    expect(hits.length).toBeGreaterThan(0)
    for (const p of hits) {
      expect(fs.statSync(p).isFile()).toBe(true)
      expect(p.endsWith('.jsx')).toBe(true)
    }
  })

  it('matches a bare word as a substring, not only as a glob', async () => {
    const hits = await call('fs_find_files', { pattern: 'package' })
    expect(hits.some(p => p.endsWith('package.json'))).toBe(true)
  })

  it('matches a path-shaped glob against the path, not the basename', async () => {
    const hits = await call('fs_find_files', { pattern: 'src/**/*.jsx' })
    expect(hits.some(p => p.endsWith(path.join('components', 'Card.jsx')))).toBe(true)
  })

  it('prunes node_modules unless asked for it', async () => {
    const pruned = await call('fs_find_files', { extension: 'jsx' })
    expect(pruned.some(p => p.includes('node_modules'))).toBe(false)
    const included = await call('fs_find_files', { extension: 'jsx', includeIgnored: true })
    expect(included.some(p => p.includes('node_modules'))).toBe(true)
  })

  it('honours the result cap', async () => {
    const hits = await call('fs_find_files', { pattern: '*', limit: 1 })
    expect(hits).toHaveLength(1)
  })

  it('respects maxDepth — walk() used to hardcode 40 and ignore it', async () => {
    const shallow = await call('fs_find_files', { pattern: '*', maxDepth: 0, includeIgnored: true })
    expect(shallow.some(p => p.endsWith('package.json'))).toBe(true)
    expect(shallow.some(p => p.endsWith('Card.jsx'))).toBe(false)
  })
})

describe('containment', () => {
  it('refuses to read outside the granted folder', async () => {
    await expect(call('fs_read', { path: '../../etc/passwd' })).rejects.toThrow()
  })

  it('resolves this chat through the real roots registry', () => {
    const roots = require_('../electron/roots.cjs')
    expect(roots.rootPathsFor({ conversationId: 'c1' })).toEqual([dir])
  })
})

describe('fs_read / fs_write round trip', () => {
  it('writes and reads back inside the granted folder', async () => {
    await call('fs_write', { path: 'notes/hello.txt', content: 'hi there' })
    expect(await call('fs_read', { path: 'notes/hello.txt' })).toBe('hi there')
  })
})

describe('fs_list', () => {
  it('flags directories with is_dir (the renderer filtered on isDir and kept them)', async () => {
    const rows = await call('fs_list', { path: 'src' })
    const names = Object.fromEntries(rows.map(r => [r.name, r.is_dir]))
    expect(names['components']).toBe(true)
    expect(names['app.jsx']).toBe(false)
  })
})

describe('fs_search', () => {
  it('finds a string and reports its line', async () => {
    const hits = await call('fs_search', { query: 'NEEDLE' })
    expect(hits.length).toBeGreaterThan(0)
    expect(hits[0].line).toEqual(expect.any(Number))
    expect(hits[0].text).toContain('NEEDLE')
  })
})
