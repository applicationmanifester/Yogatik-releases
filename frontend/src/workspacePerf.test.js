// The explorer felt slow, and the two reasons were measurable rather than
// architectural. This file pins both fixes against a REAL temp directory,
// because the old cost was in syscalls and a mocked fs cannot show it.
//
// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createRequire } from 'module'
import fs from 'fs'
import os from 'os'
import path from 'path'

const require_ = createRequire(import.meta.url)
const fsIndex = require_('../electron/fsIndex.cjs')
const watchFilter = require_('../electron/watchFilter.cjs')

let root

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'yogatik-perf-'))
  fs.mkdirSync(path.join(root, 'src'))
  fs.mkdirSync(path.join(root, 'node_modules'))
  for (let i = 0; i < 300; i++) fs.writeFileSync(path.join(root, 'src', `f${i}.txt`), 'x')
  fs.writeFileSync(path.join(root, 'node_modules', 'dep.js'), 'x')
})

afterAll(() => { try { fs.rmSync(root, { recursive: true, force: true }) } catch { /* best effort */ } })

describe('listDir', () => {
  it('returns every entry with a real size, in one shallow pass', async () => {
    fsIndex.invalidate()
    const entries = await fsIndex.listDir(path.join(root, 'src'))
    expect(entries).toHaveLength(300)
    // withStats used to be one AWAITED stat per entry, serialising the whole
    // listing behind the slowest syscall on the list. The sizes must still be
    // real after the bounded-parallel pass, or "faster" would just mean "wrong".
    expect(entries.every(e => e.size === 1)).toBe(true)
    expect(entries.every(e => e.mtimeMs > 0)).toBe(true)
  })

  it('serves a repeat listing from cache — this is the explorer re-expanding a folder', async () => {
    fsIndex.invalidate()
    const first = await fsIndex.listDir(path.join(root, 'src'))
    // Written BEHIND the cache's back: if the second call hits the disk, it
    // sees 301. Asserting on identity as well means a cache that silently
    // re-walked and happened to agree would still fail.
    fs.writeFileSync(path.join(root, 'src', 'sneaky.txt'), 'x')
    const second = await fsIndex.listDir(path.join(root, 'src'))
    expect(second).toBe(first)
    expect(second).toHaveLength(300)
  })

  it('invalidates the directory that changed and NOTHING else', async () => {
    fsIndex.invalidate()
    const src = await fsIndex.listDir(path.join(root, 'src'))
    const top = await fsIndex.listDir(root)

    // A write under node_modules must not throw away the listing of src/ that
    // the user is looking at — that scoping is the whole point.
    fsIndex.invalidate(path.join(root, 'node_modules', 'dep.js'))
    expect(await fsIndex.listDir(path.join(root, 'src'))).toBe(src)

    // A write inside src/ must.
    fsIndex.invalidate(path.join(root, 'src', 'f0.txt'))
    expect(await fsIndex.listDir(path.join(root, 'src'))).not.toBe(src)
    // ...and so must the parent, whose row for src/ now has a new mtime.
    expect(await fsIndex.listDir(root)).not.toBe(top)
  })
})

describe('watch filter', () => {
  it('drops the churn that made the tree feel slow', () => {
    for (const p of [
      'node_modules/react/index.js',
      'node_modules/.bin/vite',
      'dist/assets/index-abc.js',
      'coverage/lcov.info',
      '.venv/lib/python3.11/site-packages/x.py',
      'src/.#app.jsx',
      'src/app.jsx.swp',
      'src/4913',
      'src/app.jsx~',
    ]) expect(watchFilter.classify(p), p).toBeNull()
  })

  it('forwards a real edit, and a git state change as its own kind', () => {
    expect(watchFilter.classify('src/app.jsx')).toBe('tree')
    expect(watchFilter.classify('README.md')).toBe('tree')
    // A file legitimately NAMED like a noise directory is content.
    expect(watchFilter.classify('src/build')).toBe('tree')
    expect(watchFilter.classify('src/target')).toBe('tree')

    for (const p of ['.git/HEAD', '.git/index', '.git/refs/heads/main', '.git/MERGE_HEAD', '.git/packed-refs']) {
      expect(watchFilter.classify(p), p).toBe('git')
    }
    // ...while the thousands of object writes a checkout makes are not.
    expect(watchFilter.classify('.git/objects/ab/cdef')).toBeNull()
    expect(watchFilter.classify('.git/logs/HEAD')).toBeNull()
  })
})
