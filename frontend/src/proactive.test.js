import { describe, it, expect } from 'vitest'
import { buildCheckin } from './proactive'

const DAY = 24 * 60 * 60 * 1000

describe('buildCheckin', () => {
  it('returns null with no episodic memory', () => {
    expect(buildCheckin([])).toBe(null)
  })

  it('surfaces an anniversary milestone', () => {
    const now = Date.now()
    const c = buildCheckin([{ text: 'started new job', importance: 0.8, at: now - 365 * DAY }], now)
    expect(c.kind).toBe('milestone')
    expect(c.text).toMatch(/A year ago/)
    expect(c.prompt).toMatch(/started new job/)
  })

  it('falls back to a recent high-salience event', () => {
    const now = Date.now()
    const c = buildCheckin([{ text: 'adopted a puppy', importance: 0.7, at: now - 2 * DAY }], now)
    expect(c.kind).toBe('followup')
    expect(c.text).toMatch(/adopted a puppy/)
  })

  it('ignores low-salience or stale events', () => {
    const now = Date.now()
    expect(buildCheckin([{ text: 'trivia', importance: 0.3, at: now - 2 * DAY }], now)).toBe(null)
    expect(buildCheckin([{ text: 'old thing', importance: 0.9, at: now - 30 * DAY }], now)).toBe(null)
  })
})
