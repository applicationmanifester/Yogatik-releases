import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  beginTool, settleTool, subscribeToolStatus, isLongRunning,
  friendlyError, _resetToolStatus, LONG_RUNNING_MS,
} from './toolStatus'

describe('toolStatus hub', () => {
  beforeEach(() => _resetToolStatus())

  it('publishes a running record on beginTool', () => {
    const seen = []
    subscribeToolStatus(list => seen.push(list))
    beginTool('web_search', { query: 'hi' })
    const last = seen.at(-1)
    expect(last).toHaveLength(1)
    expect(last[0]).toMatchObject({ name: 'web_search', phase: 'running' })
  })

  it('marks a truthy result as done', () => {
    let list = []
    subscribeToolStatus(l => { list = l })
    const id = beginTool('calculator')
    settleTool(id, { success: true, value: 42 })
    expect(list[0].phase).toBe('done')
    expect(list[0].endedAt).toBeGreaterThanOrEqual(list[0].startedAt)
  })

  it('treats {success:false} / error / falsy results as failures + diagnoses them', () => {
    let list = []
    subscribeToolStatus(l => { list = l })
    const id = beginTool('web_extract')
    settleTool(id, { success: false, error: 'Failed to fetch: network offline' })
    expect(list[0].phase).toBe('error')
    expect(list[0].diagnosis.type).toBe('network')
    expect(friendlyError(list[0])).toMatch(/connection/i)
  })

  it('settleTool on an unknown id is a no-op', () => {
    expect(() => settleTool('nope#1', { success: true })).not.toThrow()
  })

  it('isLongRunning flips only after the threshold', () => {
    const id = beginTool('deep_research')
    let rec
    subscribeToolStatus(l => { rec = l[0] })
    const start = rec.startedAt
    expect(isLongRunning(rec, start + 100)).toBe(false)
    expect(isLongRunning(rec, start + LONG_RUNNING_MS + 1)).toBe(true)
    settleTool(id, { success: true })
  })

  it('unsubscribe stops further notifications', () => {
    const fn = vi.fn()
    const off = subscribeToolStatus(fn)
    const calls = fn.mock.calls.length
    off()
    beginTool('translate')
    expect(fn.mock.calls.length).toBe(calls)
  })

  it('a throwing subscriber does not break the hub', () => {
    subscribeToolStatus(() => { throw new Error('bad subscriber') })
    expect(() => beginTool('qr_generate')).not.toThrow()
  })
})
