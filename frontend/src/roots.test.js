import { describe, it, expect, beforeAll } from 'vitest'
import {
  rootIdFor, emptyState, resolveRootIds, resolveWithin,
  materialise, addRoot, removeRoot, setPrimary, rebindChat, migrateLegacyGrant,
} from '../electron/rootsCore.cjs'
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
    expect(root.path).toBe(nodePath.resolve('/a'))
    expect(root.label).toBe('a')
    expect(state.roots[root.id]).toBeTruthy()
    expect(state.bindings['chat:1']).toEqual(['b', root.id])
    expect(state.bindings['project:9']).toEqual(['b'])
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
    expect(st.bindings['chat:42']).toHaveLength(1)
  })

  it('rebindChat is a no-op when the draft had no binding', () => {
    const st = rebindChat(seeded(), 'c_new_zzz', 42)
    expect(st.bindings['chat:42']).toBeUndefined()
  })

  it('migrateLegacyGrant makes the old single root the default', () => {
    const st = migrateLegacyGrant(emptyState(), '/legacy')
    const id = rootIdFor('/legacy')
    expect(st.roots[id].path).toBe(nodePath.resolve('/legacy'))
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
