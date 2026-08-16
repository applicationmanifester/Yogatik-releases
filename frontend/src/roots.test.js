import { describe, it, expect, beforeAll } from 'vitest'
import { rootIdFor, emptyState, resolveRootIds, resolveWithin } from '../electron/rootsCore.cjs'
import os from 'node:os'
import nodePath from 'node:path'
import nodeFs from 'node:fs'

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
    try { nodeFs.symlinkSync(outside, link, 'junction') } catch { return }
    expect(() => resolveWithin([rootA], 'escape/secret.txt')).toThrow(/outside/i)
  })

  it('refuses writing THROUGH a symlink to a file that does not exist yet', () => {
    const link = nodePath.join(rootA, 'escape2')
    try { nodeFs.symlinkSync(outside, link, 'junction') } catch { return }
    expect(() => resolveWithin([rootA], 'escape2/brand-new.txt')).toThrow(/outside/i)
  })
})
