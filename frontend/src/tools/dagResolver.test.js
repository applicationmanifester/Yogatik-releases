import { describe, it, expect } from 'vitest'
import { resolveTaskWaves, enrichTaskWithUpstream } from './dagResolver'

describe('dagResolver', () => {
  it('returns single wave when no tasks have dependencies', () => {
    const tasks = [
      { agent: 'researcher', task: 'find facts' },
      { agent: 'coder', task: 'write code' },
    ]
    const waves = resolveTaskWaves(tasks)
    expect(waves.length).toBe(1)
    expect(waves[0].length).toBe(2)
  })

  it('orders tasks into sequential waves according to depends_on', () => {
    const tasks = [
      { id: 'plan', agent: 'planner', task: 'create architecture' },
      { id: 'code', agent: 'coder', task: 'implement plan', depends_on: ['plan'] },
      { id: 'test', agent: 'qa', task: 'write tests', depends_on: ['code'] },
      { id: 'docs', agent: 'writer', task: 'write docs', depends_on: ['plan'] },
    ]
    const waves = resolveTaskWaves(tasks)
    expect(waves.length).toBe(3)
    // Wave 0: plan
    expect(waves[0].map(w => w.id)).toEqual(['plan'])
    // Wave 1: code and docs (both only depend on plan)
    expect(waves[1].map(w => w.id).sort()).toEqual(['code', 'docs'])
    // Wave 2: test (depends on code)
    expect(waves[2].map(w => w.id)).toEqual(['test'])
  })

  it('handles cyclic dependencies gracefully without infinite loop', () => {
    const tasks = [
      { id: 'a', agent: 'coder', task: 'task a', depends_on: ['b'] },
      { id: 'b', agent: 'coder', task: 'task b', depends_on: ['a'] },
    ]
    const waves = resolveTaskWaves(tasks)
    expect(waves.length).toBeGreaterThan(0)
    expect(waves[0].length).toBe(2)
  })

  it('enriches task prompt with upstream outputs', () => {
    const taskItem = { id: 'code', task: 'Implement authentication endpoints' }
    const resultsById = new Map([
      ['plan', { agent: 'Planner', role: 'planner', result: 'Use JWT with 15min expiry' }],
    ])
    const enriched = enrichTaskWithUpstream(taskItem, ['plan'], resultsById)
    expect(enriched).toContain('Implement authentication endpoints')
    expect(enriched).toContain('Use JWT with 15min expiry')
    expect(enriched).toContain('Planner')
  })
})
