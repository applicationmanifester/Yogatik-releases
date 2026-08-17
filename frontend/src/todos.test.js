import { describe, it, expect } from 'vitest'
import { normalizeTodos, applyTodoOps, todoBlock, summarizeTodos } from './todos'

describe('normalizeTodos', () => {
  it('accepts plain strings and gives them ids and pending status', () => {
    const out = normalizeTodos(['write tests', 'ship it'])
    expect(out).toHaveLength(2)
    expect(out[0].text).toBe('write tests')
    expect(out[0].status).toBe('pending')
    expect(out[0].id).toBeTruthy()
  })

  it('keeps a valid status and rejects an invalid one', () => {
    const out = normalizeTodos([
      { text: 'a', status: 'in_progress' },
      { text: 'b', status: 'nonsense' },
    ])
    expect(out[0].status).toBe('in_progress')
    expect(out[1].status).toBe('pending')
  })

  it('drops empty entries', () => {
    expect(normalizeTodos(['', '   ', null, 'real'])).toHaveLength(1)
  })

  it('is empty for junk input', () => {
    expect(normalizeTodos(null)).toEqual([])
    expect(normalizeTodos('not an array')).toEqual([])
  })

  it('preserves ids it is given so updates can target them', () => {
    expect(normalizeTodos([{ id: 'x1', text: 'a' }])[0].id).toBe('x1')
  })
})

describe('applyTodoOps', () => {
  const base = [
    { id: '1', text: 'first', status: 'pending' },
    { id: '2', text: 'second', status: 'pending' },
  ]

  it('replaces the whole list', () => {
    const out = applyTodoOps(base, { replace: ['only one'] })
    expect(out).toHaveLength(1)
    expect(out[0].text).toBe('only one')
  })

  it('adds items to the end', () => {
    expect(applyTodoOps(base, { add: ['third'] })).toHaveLength(3)
  })

  it('updates a status by id', () => {
    const out = applyTodoOps(base, { update: [{ id: '2', status: 'completed' }] })
    expect(out.find(t => t.id === '2').status).toBe('completed')
    expect(out.find(t => t.id === '1').status).toBe('pending')
  })

  it('ignores an update for an unknown id rather than throwing', () => {
    expect(() => applyTodoOps(base, { update: [{ id: 'nope', status: 'completed' }] })).not.toThrow()
    expect(applyTodoOps(base, { update: [{ id: 'nope', status: 'completed' }] })).toHaveLength(2)
  })

  it('removes by id', () => {
    expect(applyTodoOps(base, { remove: ['1'] })).toHaveLength(1)
  })

  it('returns the list unchanged with no ops', () => {
    expect(applyTodoOps(base, {})).toEqual(base)
  })
})

describe('summarizeTodos', () => {
  it('counts by status', () => {
    const list = [
      { id: '1', text: 'a', status: 'completed' },
      { id: '2', text: 'b', status: 'in_progress' },
      { id: '3', text: 'c', status: 'pending' },
      { id: '4', text: 'd', status: 'pending' },
    ]
    expect(summarizeTodos(list)).toEqual({ total: 4, completed: 1, in_progress: 1, pending: 2 })
  })
})

describe('todoBlock', () => {
  it('is empty with no todos, so it costs nothing when unused', () => {
    expect(todoBlock([])).toBe('')
  })

  it('lists open items with their status markers', () => {
    const out = todoBlock([
      { id: '1', text: 'done thing', status: 'completed' },
      { id: '2', text: 'doing thing', status: 'in_progress' },
      { id: '3', text: 'todo thing', status: 'pending' },
    ])
    expect(out).toContain('doing thing')
    expect(out).toContain('todo thing')
    expect(out).toMatch(/TASK LIST/i)
  })

  it('omits the block entirely once everything is complete', () => {
    expect(todoBlock([{ id: '1', text: 'a', status: 'completed' }])).toBe('')
  })
})
