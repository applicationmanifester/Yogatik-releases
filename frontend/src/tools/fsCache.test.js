// @vitest-environment node
//
// The file-content cache was keyed by PATH ALONE. Every chat has its own
// working folders and tool paths are routinely relative to them, so two chats
// both reading "src/index.js" collided — and the second was served the first
// one's file, returned as `success: true, cached: true`. A cross-chat content
// leak that looks exactly like a fast read.
import { describe, it, expect, beforeEach } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { globalFsCache } from './fsCache'

const HERE = path.dirname(fileURLToPath(import.meta.url))
beforeEach(() => globalFsCache.clear())

describe('reads are scoped to the calling chat', () => {
  it('THE BUG: the same relative path in two chats no longer collides', () => {
    globalFsCache.set('src/index.js', 'ALPHA content', Date.now(), null, 'chat-A')
    globalFsCache.set('src/index.js', 'BETA content', Date.now(), null, 'chat-B')
    expect(globalFsCache.get('src/index.js', null, null, 'chat-A')).toBe('ALPHA content')
    expect(globalFsCache.get('src/index.js', null, null, 'chat-B')).toBe('BETA content')
  })

  it('an unscoped read cannot reach a chat-scoped entry', () => {
    globalFsCache.set('src/index.js', 'ALPHA', Date.now(), null, 'chat-A')
    expect(globalFsCache.get('src/index.js')).toBeNull()
  })
})

describe('writes invalidate everywhere, because folders can be shared', () => {
  it('drops the path in EVERY chat', () => {
    // Scoping invalidation too would trade the leak for a staleness bug: two
    // chats are allowed to hold the same folder, and a write in one must not
    // leave the other serving pre-write bytes for a file they genuinely share.
    globalFsCache.set('shared/config.json', 'v1', Date.now(), null, 'chat-A')
    globalFsCache.set('shared/config.json', 'v1', Date.now(), null, 'chat-B')
    expect(globalFsCache.invalidate('shared/config.json')).toBe(true)
    expect(globalFsCache.get('shared/config.json', null, null, 'chat-A')).toBeNull()
    expect(globalFsCache.get('shared/config.json', null, null, 'chat-B')).toBeNull()
  })

  it('invalidateScope drops one chat and leaves the others', () => {
    globalFsCache.set('a.txt', 'A', Date.now(), null, 'chat-A')
    globalFsCache.set('a.txt', 'B', Date.now(), null, 'chat-B')
    globalFsCache.invalidateScope('chat-A')
    expect(globalFsCache.get('a.txt', null, null, 'chat-A')).toBeNull()
    expect(globalFsCache.get('a.txt', null, null, 'chat-B')).toBe('B')
  })

  it('keeps byte accounting correct when one path spans several chats', () => {
    // A leaked byte count silently shrinks the usable cache until nothing fits.
    globalFsCache.set('x.txt', '12345', Date.now(), null, 'A')
    globalFsCache.set('x.txt', '12345', Date.now(), null, 'B')
    globalFsCache.invalidate('x.txt')
    expect(globalFsCache.stats().entries).toBe(0)
    expect(globalFsCache.stats().bytes).toBe(0)
  })
})

describe('wiring', () => {
  const src = fs.readFileSync(path.join(HERE, 'localFs.js'), 'utf8')

  it('every cache call in the fs tools passes a scope', () => {
    // A single unscoped call reopens the leak, and it reads as a normal cache
    // hit — nothing throws, nothing logs.
    const calls = [...src.matchAll(/globalFsCache\.(get|set)\(([^;\n]*)/g)]
    expect(calls.length).toBeGreaterThan(0)
    for (const c of calls) {
      expect(c[0], `unscoped globalFsCache.${c[1]} in localFs.js: ${c[0].slice(0, 80)}`)
        .toMatch(/cacheScope\(opts\)/)
    }
  })

  it('the scope is the CALLING chat, not the ambient one', () => {
    expect(src).toMatch(/function cacheScope\(opts\)[\s\S]{0,200}getWorkspaceCtx\(opts\?\.ctx\)/)
  })
})
