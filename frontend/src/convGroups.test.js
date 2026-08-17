import { describe, it, expect } from 'vitest'
import { groupLabel, groupConversations, GROUP_ORDER } from './convGroups'

// A fixed "now" at midday, so a test never straddles a real midnight.
const NOW = new Date('2026-08-17T12:00:00').getTime()
const DAY = 86400000
const at = (ms) => ({ c: { updatedAt: ms }, i: 0 })

describe('groupLabel', () => {
  it('counts the calendar day, not the last 24 hours', () => {
    // 01:00 today is >24h before midday tomorrow but is still Today.
    expect(groupLabel(new Date('2026-08-17T01:00:00').getTime(), NOW)).toBe('Today')
  })

  it('separates yesterday from today across local midnight', () => {
    expect(groupLabel(new Date('2026-08-16T23:59:00').getTime(), NOW)).toBe('Yesterday')
    expect(groupLabel(new Date('2026-08-17T00:01:00').getTime(), NOW)).toBe('Today')
  })

  it('walks out through the wider buckets', () => {
    expect(groupLabel(NOW - 3 * DAY, NOW)).toBe('Previous 7 days')
    expect(groupLabel(NOW - 20 * DAY, NOW)).toBe('Previous 30 days')
    expect(groupLabel(NOW - 200 * DAY, NOW)).toBe('Older')
  })

  it('treats a missing timestamp as Today, not Older', () => {
    // A freshly created chat may have no updatedAt yet; sending it to the
    // bottom of the list would hide the one the user is actually in.
    expect(groupLabel(undefined, NOW)).toBe('Today')
    expect(groupLabel(null, NOW)).toBe('Today')
  })
})

describe('groupConversations', () => {
  it('returns only non-empty groups, in order', () => {
    const groups = groupConversations([at(NOW), at(NOW - 200 * DAY)], NOW)
    expect(groups.map(g => g.label)).toEqual(['Today', 'Older'])
  })

  it('keeps every conversation exactly once', () => {
    const entries = [at(NOW), at(NOW - DAY), at(NOW - 3 * DAY), at(NOW - 200 * DAY)]
    const total = groupConversations(entries, NOW).reduce((n, g) => n + g.items.length, 0)
    expect(total).toBe(entries.length)
  })

  it('preserves the incoming order within a group', () => {
    const a = { c: { updatedAt: NOW, title: 'a' }, i: 0 }
    const b = { c: { updatedAt: NOW, title: 'b' }, i: 1 }
    expect(groupConversations([a, b], NOW)[0].items.map(e => e.c.title)).toEqual(['a', 'b'])
  })

  it('handles an empty list without inventing groups', () => {
    expect(groupConversations([], NOW)).toEqual([])
    expect(groupConversations(undefined, NOW)).toEqual([])
  })

  it('every label it can emit is in GROUP_ORDER', () => {
    const labels = groupConversations(
      [at(NOW), at(NOW - DAY), at(NOW - 3 * DAY), at(NOW - 20 * DAY), at(NOW - 200 * DAY)], NOW,
    ).map(g => g.label)
    for (const l of labels) expect(GROUP_ORDER).toContain(l)
  })
})
