import { describe, it, expect, beforeAll } from 'vitest'
import { rootIdFor, emptyState, resolveRootIds } from '../electron/rootsCore.cjs'

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
