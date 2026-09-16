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
let journalDir
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
  const { registerFsBridge, initJournal } = require_('../electron/fsBridge.cjs')
  // Without a journal the bridge still works, but "the previous content is
  // recoverable" — the sentence that makes warn-but-proceed defensible on a
  // stale write — would be untested.
  journalDir = fs.mkdtempSync(path.join(os.tmpdir(), 'yogatik-journal-'))
  initJournal(journalDir)
  registerFsBridge()
  handlers = globalThis.__IPC_HANDLERS__
})

afterAll(() => {
  Module._load = originalLoad
  try { fs.rmSync(dir, { recursive: true, force: true }) } catch { /* best effort */ }
  try { fs.rmSync(journalDir, { recursive: true, force: true }) } catch { /* best effort */ }
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
    const res = await call('fs_read', { path: 'notes/hello.txt' })
    expect(res.content).toBe('hi there')
    expect(res.truncated).toBe(false)
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


/**
 * The five data-loss paths, each MEASURED against the real handlers before it
 * was fixed. The comment on each test is what the old code actually did.
 */
describe('data loss', () => {
  it('refuses an empty old_string instead of shredding the file', async () => {
    // MEASURED: fs_edit({oldString:'', replaceAll:true}) turned "hello" into
    // "hXeXlXlXo" — new_string inserted between every character, no error.
    const f = path.join(dir, 'shred.txt')
    fs.writeFileSync(f, 'hello')
    await expect(call('fs_edit', { path: 'shred.txt', oldString: '', newString: 'X', replaceAll: true }))
      .rejects.toThrow(/non-empty/i)
    expect(fs.readFileSync(f, 'utf8')).toBe('hello')
  })

  it('says so when a read was truncated', async () => {
    // MEASURED: a 1000-byte file read with maxBytes 100 came back as a bare
    // 100-character string with nothing to distinguish it from a whole file,
    // and the model then rewrote the file from that fragment.
    const f = path.join(dir, 'big.txt')
    fs.writeFileSync(f, Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n'))
    const res = await call('fs_read', { path: 'big.txt', maxBytes: 100 })
    expect(res.truncated).toBe(true)
    expect(res.bytes).toBeGreaterThan(res.content.length)
    expect(res.note).toMatch(/truncated/i)
  })

  it('reads a line range without pretending it is the whole file', async () => {
    const res = await call('fs_read', { path: 'big.txt', offset: 5, limit: 3 })
    expect(res.content.split('\n')).toHaveLength(3)
    expect(res.content.startsWith('line 4')).toBe(true)
    expect(res.range).toEqual({ firstLine: 5, lastLine: 7 })
  })

  it('keeps CRLF line endings through a write', async () => {
    // MEASURED: "a\r\nb\r\n" came back as "a\nb\n" — a one-line change
    // rewrote every line of the file and the git diff was the whole file.
    const f = path.join(dir, 'crlf.txt')
    fs.writeFileSync(f, 'a\r\nb\r\n')
    await call('fs_write', { path: 'crlf.txt', content: 'a\nc\n' })
    expect(fs.readFileSync(f, 'utf8')).toBe('a\r\nc\r\n')
  })

  it('keeps CRLF through an edit, and matches an LF anchor against it', async () => {
    const f = path.join(dir, 'crlf2.txt')
    fs.writeFileSync(f, 'one\r\ntwo\r\nthree\r\n')
    await call('fs_edit', { path: 'crlf2.txt', oldString: 'two\nthree', newString: 'TWO\nTHREE' })
    expect(fs.readFileSync(f, 'utf8')).toBe('one\r\nTWO\r\nTHREE\r\n')
  })

  it('refuses to move onto an existing file unless told to', async () => {
    // MEASURED: fs_move destroyed a destination holding "IMPORTANT" without a
    // word, and journalled the SOURCE — the side that survived.
    fs.writeFileSync(path.join(dir, 's.txt'), 'source')
    fs.writeFileSync(path.join(dir, 'd.txt'), 'IMPORTANT')
    await expect(call('fs_move', { src: 's.txt', dest: 'd.txt' })).rejects.toThrow(/already exists/i)
    expect(fs.readFileSync(path.join(dir, 'd.txt'), 'utf8')).toBe('IMPORTANT')

    await call('fs_move', { src: 's.txt', dest: 'd.txt', overwrite: true })
    expect(fs.readFileSync(path.join(dir, 'd.txt'), 'utf8')).toBe('source')
  })

  it('refuses to copy onto an existing file unless told to', async () => {
    fs.writeFileSync(path.join(dir, 'c1.txt'), 'one')
    fs.writeFileSync(path.join(dir, 'c2.txt'), 'two')
    await expect(call('fs_copy', { src: 'c1.txt', dest: 'c2.txt' })).rejects.toThrow(/already exists/i)
    expect(fs.readFileSync(path.join(dir, 'c2.txt'), 'utf8')).toBe('two')
  })

  it('reports a write landing on a file that changed underneath it', async () => {
    const f = path.join(dir, 'race.txt')
    fs.writeFileSync(f, 'original')
    const read = await call('fs_read', { path: 'race.txt' })
    fs.writeFileSync(f, 'the user edited this in their IDE')
    const res = await call('fs_write', { path: 'race.txt', content: 'model version', expectedHash: read.hash })
    expect(res.stale).toBe(true)
    expect(res.warning).toMatch(/changed on disk/i)
    // Warn-but-proceed is only safe because the clobbered text is recoverable.
    const entries = await call('journal_list', {})
    expect(entries.some(e => e.target === f)).toBe(true)
  })

  it('does not flag a write when nothing changed underneath', async () => {
    const f = path.join(dir, 'norace.txt')
    fs.writeFileSync(f, 'stable')
    const read = await call('fs_read', { path: 'norace.txt' })
    const res = await call('fs_write', { path: 'norace.txt', content: 'next', expectedHash: read.hash })
    expect(res.stale).toBe(false)
    expect(res.warning).toBeNull()
  })
})

describe('fs_multi_edit', () => {
  it('applies every edit and writes once', async () => {
    const f = path.join(dir, 'multi.txt')
    fs.writeFileSync(f, 'alpha beta gamma')
    const res = await call('fs_multi_edit', {
      path: 'multi.txt',
      edits: [
        { oldString: 'alpha', newString: 'A' },
        { oldString: 'gamma', newString: 'G' },
      ],
    })
    expect(res.replaced).toBe(2)
    expect(fs.readFileSync(f, 'utf8')).toBe('A beta G')
  })

  it('leaves the file untouched when any edit fails', async () => {
    // Running fs_edit three times would have written the file twice before
    // failing, leaving it half-edited and every watcher having seen it.
    const f = path.join(dir, 'atomic.txt')
    fs.writeFileSync(f, 'alpha beta gamma')
    await expect(call('fs_multi_edit', {
      path: 'atomic.txt',
      edits: [
        { oldString: 'alpha', newString: 'A' },
        { oldString: 'NOT PRESENT', newString: 'X' },
      ],
    })).rejects.toThrow(/Edit 2 of 2/)
    expect(fs.readFileSync(f, 'utf8')).toBe('alpha beta gamma')
  })
})

describe('fs_file_tree', () => {
  it('draws a real tree with continuation bars', async () => {
    const out = await call('fs_file_tree', { path: 'src', maxDepth: 3 })
    expect(out).toMatch(/[├└]── /)
    expect(out).toContain('components/')
  })
})


describe('fs_search survives a hostile pattern', () => {
  it('does not hang on a catastrophic regex, and says why', async () => {
    // THE regression. Before this, `(a+)+$` compiled on the main process and
    // never returned — the whole desktop app frozen, timers dead, only Task
    // Manager left. The guard refuses the shape; the worker is the backstop.
    fs.writeFileSync(path.join(dir, 'src', 'evil.txt'), 'a'.repeat(60) + '!')
    const started = Date.now()
    const res = await call('fs_search', { query: '(a+)+$', regex: true })
    expect(Date.now() - started).toBeLessThan(20_000)
    expect(res.pattern_rejected).toBe(true)
    expect(res.note).toMatch(/exponential|repetition/i)
    // Refused is not the same as "no results": it falls back to a literal
    // search so the user still gets an answer for what they typed.
    expect(Array.isArray(res.results)).toBe(true)
  })

  it('still runs an ordinary regex search', async () => {
    const hits = await call('fs_search', { query: 'NEEDLE|nothing', regex: true })
    const rows = Array.isArray(hits) ? hits : hits.results
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].text).toContain('NEEDLE')
  })

  it('honours a glob without letting * cross directories', async () => {
    const rows = await call('fs_search', { query: 'export', glob: '*.jsx' })
    const list = Array.isArray(rows) ? rows : rows.results
    for (const r of list) expect(r.path.endsWith('.jsx')).toBe(true)
  })
})


describe('journal housekeeping stays off the boot path', () => {
  it('createJournal returns without pruning synchronously', async () => {
    // MEASURED: prune() reads the index and statSync's every blob. It ran
    // INSIDE createJournal, which main.cjs calls before createWindow(), so the
    // window waited on it — 64ms for 8000 entries on tmpfs, far worse on NTFS.
    const { createJournal } = require_('../electron/journalCore.cjs')
    const store = fs.mkdtempSync(path.join(os.tmpdir(), 'yogatik-jprune-'))
    const blobs = path.join(store, 'blobs')
    fs.mkdirSync(blobs, { recursive: true })

    const lines = []
    for (let i = 0; i < 400; i++) {
      const id = String(i).padStart(8, '0')
      fs.writeFileSync(path.join(blobs, id), 'x')
      // Old enough that a prune would delete every one of them.
      lines.push(JSON.stringify({
        id, chatId: 'c1', op: 'fs_write', target: `/f/${i}`,
        ts: Date.now() - 40 * 24 * 3600 * 1000, existed: true, kind: 'file',
        blob: path.join(blobs, id),
      }))
    }
    fs.writeFileSync(path.join(store, 'index.jsonl'), lines.join('\n') + '\n')

    const journal = createJournal({ storeDir: store })
    // The blobs are still there: construction did not prune.
    expect(fs.readdirSync(blobs).length).toBe(400)
    // And pruning still works when it is actually asked for.
    journal.prune()
    expect(fs.readdirSync(blobs).length).toBe(0)

    fs.rmSync(store, { recursive: true, force: true })
  })
})

describe('fs_edit resilient fuzzy matching & diagnostics', () => {
  it('matches across quote differences (single vs double vs backticks)', async () => {
    const f = path.join(dir, 'quotes.js')
    fs.writeFileSync(f, 'const greeting = "hello world";\nconst name = "yogatik";\n')
    await call('fs_edit', {
      path: 'quotes.js',
      oldString: "const greeting = 'hello world';",
      newString: "const greeting = 'hi world';",
    })
    expect(fs.readFileSync(f, 'utf8')).toContain("const greeting = 'hi world';")
  })

  it('matches across blank line variations and trailing semicolons', async () => {
    const f = path.join(dir, 'blanklines.js')
    fs.writeFileSync(f, 'function calc() {\n\n  const x = 1;\n  return x\n}\n')
    await call('fs_edit', {
      path: 'blanklines.js',
      oldString: 'function calc() {\n  const x = 1\n  return x;\n}',
      newString: 'function calc() {\n  return 42;\n}',
    })
    expect(fs.readFileSync(f, 'utf8')).toBe('function calc() {\n  return 42;\n}\n')
  })

  it('provides closest match line and excerpt on edit failure', async () => {
    const f = path.join(dir, 'miss.js')
    fs.writeFileSync(f, 'const alpha = 100;\nconst beta = 200;\nconst gamma = 300;\n')
    await expect(call('fs_edit', {
      path: 'miss.js',
      oldString: 'const beta_incorrect = 999;\n',
      newString: 'const beta = 999;\n',
    })).rejects.toThrow(/old_string not found in file.*Closest match near line/i)
  })
})
