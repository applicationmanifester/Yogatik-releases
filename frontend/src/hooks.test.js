import { describe, it, expect } from 'vitest'
import { parseHooksFile, matchHooks, hooksEnabledFor, HOOK_EVENTS } from '../electron/hooksCore.cjs'

describe('parseHooksFile', () => {
  it('reads a list of hooks', () => {
    const h = parseHooksFile(JSON.stringify({
      hooks: [{ event: 'PostToolUse', match: 'fs_write', command: 'npm run format' }],
    }))
    expect(h).toHaveLength(1)
    expect(h[0].command).toBe('npm run format')
  })

  it('drops entries with no command', () => {
    expect(parseHooksFile(JSON.stringify({ hooks: [{ event: 'PostToolUse', match: '*' }] }))).toEqual([])
  })

  it('drops entries with an unknown event', () => {
    expect(parseHooksFile(JSON.stringify({
      hooks: [{ event: 'Whenever', match: '*', command: 'x' }],
    }))).toEqual([])
  })

  it('defaults match to * when absent', () => {
    const h = parseHooksFile(JSON.stringify({ hooks: [{ event: 'PreToolUse', command: 'x' }] }))
    expect(h[0].match).toBe('*')
  })

  it('returns empty for malformed JSON rather than throwing', () => {
    expect(parseHooksFile('{not json')).toEqual([])
    expect(parseHooksFile('')).toEqual([])
    expect(parseHooksFile(null)).toEqual([])
  })

  it('accepts every documented event name', () => {
    for (const event of HOOK_EVENTS) {
      expect(parseHooksFile(JSON.stringify({ hooks: [{ event, command: 'x' }] }))).toHaveLength(1)
    }
  })

  it('caps the number of hooks so a repo cannot queue thousands of processes', () => {
    const many = Array.from({ length: 500 }, () => ({ event: 'PostToolUse', command: 'x' }))
    expect(parseHooksFile(JSON.stringify({ hooks: many })).length).toBeLessThanOrEqual(50)
  })
})

describe('matchHooks', () => {
  const hooks = [
    { event: 'PostToolUse', match: 'fs_write', command: 'a' },
    { event: 'PostToolUse', match: 'fs_*', command: 'b' },
    { event: 'PreToolUse', match: '*', command: 'c' },
  ]

  it('matches an exact tool name', () => {
    expect(matchHooks(hooks, 'PostToolUse', 'fs_write').map(h => h.command)).toEqual(['a', 'b'])
  })

  it('matches a glob', () => {
    expect(matchHooks(hooks, 'PostToolUse', 'fs_read').map(h => h.command)).toEqual(['b'])
  })

  it('matches the wildcard on the right event only', () => {
    expect(matchHooks(hooks, 'PreToolUse', 'anything').map(h => h.command)).toEqual(['c'])
  })

  it('returns nothing for an event with no hooks', () => {
    expect(matchHooks(hooks, 'PostToolUse', 'weather')).toEqual([])
  })
})

describe('hooksEnabledFor', () => {
  it('is DISABLED by default — a repo cannot opt itself in', () => {
    expect(hooksEnabledFor({}, '/repo')).toBe(false)
  })

  it('is enabled only for a root the user explicitly trusted', () => {
    const state = { trustedHookRoots: ['/repo'] }
    expect(hooksEnabledFor(state, '/repo')).toBe(true)
    expect(hooksEnabledFor(state, '/other')).toBe(false)
  })
})
