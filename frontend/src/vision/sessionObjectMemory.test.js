import { describe, it, expect } from 'vitest'
import {
  createSessionObjectMemory,
  recordDetections,
  getActiveObjects,
  resolveReference,
  formatSpatialContext,
  clearSessionObjectMemory,
} from './sessionObjectMemory'

describe('sessionObjectMemory', () => {
  it('creates an empty memory container', () => {
    const mem = createSessionObjectMemory()
    expect(getActiveObjects(mem)).toEqual([])
  })

  it('records detected objects with spatial positions', () => {
    const mem = createSessionObjectMemory()
    const now = 1000000

    const raw = [
      { label: 'laptop', score: 0.95, box: { xmin: 0.05, ymin: 0.2, xmax: 0.3, ymax: 0.7 } },
      { label: 'cup', score: 0.88, box: { xmin: 0.45, ymin: 0.4, xmax: 0.55, ymax: 0.6 } },
      { label: 'notebook', score: 0.82, box: { xmin: 0.75, ymin: 0.3, xmax: 0.95, ymax: 0.8 } },
    ]

    const tracked = recordDetections(mem, raw, { timestamp: now })
    expect(tracked).toHaveLength(3)

    const laptop = tracked.find(o => o.label === 'laptop')
    expect(laptop.horizontal).toBe('left')
    expect(laptop.seenCount).toBe(1)

    const cup = tracked.find(o => o.label === 'cup')
    expect(cup.horizontal).toBe('centre')

    const notebook = tracked.find(o => o.label === 'notebook')
    expect(notebook.horizontal).toBe('right')
  })

  it('updates matching objects across frames instead of duplicating', () => {
    const mem = createSessionObjectMemory()
    const t1 = 1000000
    const t2 = 1001000

    // Frame 1
    recordDetections(mem, [
      { label: 'bottle', score: 0.8, box: { xmin: 0.1, ymin: 0.2, xmax: 0.25, ymax: 0.6 } },
    ], { timestamp: t1 })

    expect(getActiveObjects(mem)).toHaveLength(1)
    expect(getActiveObjects(mem)[0].seenCount).toBe(1)
    expect(getActiveObjects(mem)[0].lastSeen).toBe(t1)

    // Frame 2 (bottle slightly moved)
    recordDetections(mem, [
      { label: 'bottle', score: 0.9, box: { xmin: 0.12, ymin: 0.21, xmax: 0.26, ymax: 0.61 } },
    ], { timestamp: t2 })

    expect(getActiveObjects(mem)).toHaveLength(1)
    expect(getActiveObjects(mem)[0].seenCount).toBe(2)
    expect(getActiveObjects(mem)[0].lastSeen).toBe(t2)
    expect(getActiveObjects(mem)[0].score).toBe(0.9)
  })

  it('prunes objects that exceed TTL', () => {
    const mem = createSessionObjectMemory({ ttlMs: 5000 })
    recordDetections(mem, [
      { label: 'phone', score: 0.9, box: { xmin: 0.1, ymin: 0.1, xmax: 0.3, ymax: 0.4 } },
    ], { timestamp: 1000 })

    expect(getActiveObjects(mem)).toHaveLength(1)

    // After TTL elapsed
    recordDetections(mem, [
      { label: 'book', score: 0.85, box: { xmin: 0.7, ymin: 0.5, xmax: 0.9, ymax: 0.8 } },
    ], { timestamp: 7000 })

    const active = getActiveObjects(mem)
    expect(active).toHaveLength(1)
    expect(active[0].label).toBe('book')
  })

  it('resolves spatial reference "the one on the left"', () => {
    const mem = createSessionObjectMemory()
    const now = 1000000

    recordDetections(mem, [
      { label: 'laptop', score: 0.95, box: { xmin: 0.05, ymin: 0.2, xmax: 0.25, ymax: 0.7 } },
      { label: 'cup', score: 0.88, box: { xmin: 0.45, ymin: 0.4, xmax: 0.55, ymax: 0.6 } },
      { label: 'notebook', score: 0.82, box: { xmin: 0.75, ymin: 0.3, xmax: 0.95, ymax: 0.8 } },
    ], { timestamp: now })

    const res = resolveReference(mem, 'what is the one on the left?', { timestamp: now })
    expect(res.resolved).toBe(true)
    expect(res.target.label).toBe('laptop')
    expect(res.cue).toBe('left')
  })

  it('resolves spatial reference "the one on the right"', () => {
    const mem = createSessionObjectMemory()
    const now = 1000000

    recordDetections(mem, [
      { label: 'laptop', score: 0.95, box: { xmin: 0.05, ymin: 0.2, xmax: 0.25, ymax: 0.7 } },
      { label: 'notebook', score: 0.82, box: { xmin: 0.75, ymin: 0.3, xmax: 0.95, ymax: 0.8 } },
    ], { timestamp: now })

    const res = resolveReference(mem, 'tell me about the item on the right', { timestamp: now })
    expect(res.resolved).toBe(true)
    expect(res.target.label).toBe('notebook')
    expect(res.cue).toBe('right')
  })

  it('resolves reference with both label and spatial cue', () => {
    const mem = createSessionObjectMemory()
    const now = 1000000

    recordDetections(mem, [
      { label: 'cup', score: 0.9, box: { xmin: 0.1, ymin: 0.4, xmax: 0.2, ymax: 0.6 } },
      { label: 'cup', score: 0.85, box: { xmin: 0.8, ymin: 0.4, xmax: 0.9, ymax: 0.6 } },
    ], { timestamp: now })

    const res = resolveReference(mem, 'what is inside the cup on the right?', { timestamp: now })
    expect(res.resolved).toBe(true)
    expect(res.target.horizontal).toBe('right')
  })

  it('resolves "what did I look at earlier"', () => {
    const mem = createSessionObjectMemory()

    recordDetections(mem, [
      { label: 'passport', score: 0.9, box: { xmin: 0.2, ymin: 0.2, xmax: 0.4, ymax: 0.5 } },
    ], { timestamp: 1000 })

    recordDetections(mem, [
      { label: 'keyboard', score: 0.9, box: { xmin: 0.5, ymin: 0.5, xmax: 0.8, ymax: 0.8 } },
    ], { timestamp: 5000 })

    const res = resolveReference(mem, 'what did I look at earlier?', { timestamp: 6000 })
    expect(res.resolved).toBe(true)
    expect(res.target.label).toBe('passport')
  })

  it('formats spatial context for system prompt injection', () => {
    const mem = createSessionObjectMemory()
    const now = 1000000

    recordDetections(mem, [
      { label: 'laptop', score: 0.95, box: { xmin: 0.1, ymin: 0.2, xmax: 0.3, ymax: 0.6 } },
    ], { timestamp: now })

    const formatted = formatSpatialContext(mem, { timestamp: now })
    expect(formatted).toContain('[SESSION OBJECT MEMORY (tracked in room/camera):')
    expect(formatted).toContain('- laptop:')
    expect(formatted).toContain('seen just now')
  })

  it('clears memory cleanly', () => {
    const mem = createSessionObjectMemory()
    recordDetections(mem, [
      { label: 'pen', score: 0.9, box: { xmin: 0.1, ymin: 0.1, xmax: 0.2, ymax: 0.2 } },
    ])
    expect(getActiveObjects(mem)).toHaveLength(1)

    clearSessionObjectMemory(mem)
    expect(getActiveObjects(mem)).toHaveLength(0)
  })
})
