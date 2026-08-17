import { describe, it, expect } from 'vitest'
import { isolationKeyFor, planIsolation, mergeIsolatedDisabled } from './agentIsolation'

describe('isolationKeyFor', () => {
  it('derives a distinct workspace key per sub-agent', () => {
    const a = isolationKeyFor('chat1', 'researcher', 0)
    const b = isolationKeyFor('chat1', 'coder', 1)
    expect(a).not.toBe(b)
  })

  it('is stable for the same agent in the same chat and slot', () => {
    expect(isolationKeyFor('chat1', 'coder', 2)).toBe(isolationKeyFor('chat1', 'coder', 2))
  })

  it('namespaces under the parent chat, so two chats never collide', () => {
    expect(isolationKeyFor('chat1', 'coder', 0)).not.toBe(isolationKeyFor('chat2', 'coder', 0))
  })

  it('includes the parent id so the binding can be traced back', () => {
    expect(isolationKeyFor('chat1', 'coder', 0)).toContain('chat1')
  })
})

describe('planIsolation', () => {
  it('gives each agent its own workspace key when isolation is on', () => {
    const plan = planIsolation('chat1', ['researcher', 'coder'], { isolate: true })
    expect(plan).toHaveLength(2)
    expect(plan[0].conversationId).not.toBe(plan[1].conversationId)
    expect(plan[0].isolated).toBe(true)
  })

  it('shares the parent workspace when isolation is off', () => {
    const plan = planIsolation('chat1', ['researcher', 'coder'], { isolate: false })
    expect(plan[0].conversationId).toBe('chat1')
    expect(plan[1].conversationId).toBe('chat1')
    expect(plan[0].isolated).toBe(false)
  })

  it('defaults to NOT isolating, so existing behaviour is unchanged', () => {
    expect(planIsolation('chat1', ['a'])[0].isolated).toBe(false)
  })

  it('handles an empty agent list', () => {
    expect(planIsolation('chat1', [])).toEqual([])
  })
})

describe('mergeIsolatedDisabled', () => {
  it('always disables spawn_agents to prevent recursion', () => {
    expect(mergeIsolatedDisabled([])).toContain('spawn_agents')
  })

  it('keeps the caller-supplied disabled list', () => {
    const out = mergeIsolatedDisabled(['weather'])
    expect(out).toContain('weather')
    expect(out).toContain('spawn_agents')
  })

  it('additionally blocks folder granting for an isolated agent — a sub-agent must not widen its own access', () => {
    const out = mergeIsolatedDisabled([], { isolated: true })
    expect(out).toContain('fs_add_folder')
  })

  it('does not block folder granting when sharing the parent workspace', () => {
    expect(mergeIsolatedDisabled([], { isolated: false })).not.toContain('fs_add_folder')
  })

  it('does not duplicate entries', () => {
    const out = mergeIsolatedDisabled(['spawn_agents'])
    expect(out.filter(x => x === 'spawn_agents')).toHaveLength(1)
  })
})
