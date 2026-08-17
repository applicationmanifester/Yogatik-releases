import { describe, it, expect } from 'vitest'
import { createRingBuffer, createRegistry } from '../electron/procCore.cjs'

describe('createRingBuffer', () => {
  it('keeps everything under the cap', () => {
    const b = createRingBuffer(100)
    b.push('hello ')
    b.push('world')
    expect(b.text()).toBe('hello world')
  })

  it('drops the OLDEST output past the cap, keeping the newest', () => {
    const b = createRingBuffer(10)
    b.push('aaaaaaaaaa')
    b.push('bbbbbbbbbb')
    expect(b.text()).toBe('bbbbbbbbbb')
    expect(b.text().length).toBe(10)
  })

  it('truncates a single oversized chunk to the tail', () => {
    const b = createRingBuffer(5)
    b.push('0123456789')
    expect(b.text()).toBe('56789')
  })

  it('reports whether anything was dropped, so output is never silently lied about', () => {
    const b = createRingBuffer(5)
    expect(b.truncated()).toBe(false)
    b.push('0123456789')
    expect(b.truncated()).toBe(true)
  })

  it('supports reading only what is new since a cursor', () => {
    const b = createRingBuffer(1000)
    b.push('first')
    const cursor = b.cursor()
    b.push('second')
    expect(b.since(cursor)).toBe('second')
    expect(b.since(b.cursor())).toBe('')
  })

  it('handles an empty buffer', () => {
    const b = createRingBuffer(10)
    expect(b.text()).toBe('')
    expect(b.since(0)).toBe('')
  })
})

describe('createRegistry', () => {
  it('adds and finds a process by id', () => {
    const r = createRegistry()
    r.add({ id: 'p1', chatId: 'c1', command: 'npm test' })
    expect(r.get('p1').command).toBe('npm test')
  })

  it('lists only the processes of one chat', () => {
    const r = createRegistry()
    r.add({ id: 'p1', chatId: 'c1', command: 'a' })
    r.add({ id: 'p2', chatId: 'c2', command: 'b' })
    r.add({ id: 'p3', chatId: 'c1', command: 'c' })
    expect(r.list('c1').map(p => p.id)).toEqual(['p1', 'p3'])
  })

  it('removes a process', () => {
    const r = createRegistry()
    r.add({ id: 'p1', chatId: 'c1', command: 'a' })
    r.remove('p1')
    expect(r.get('p1')).toBeUndefined()
  })

  it('collects the ids belonging to a chat, for cleanup on close', () => {
    const r = createRegistry()
    r.add({ id: 'p1', chatId: 'c1', command: 'a' })
    r.add({ id: 'p2', chatId: 'c1', command: 'b' })
    r.add({ id: 'p3', chatId: 'c2', command: 'c' })
    expect(r.idsFor('c1').sort()).toEqual(['p1', 'p2'])
  })

  it('enforces a per-chat cap so a loop cannot spawn unlimited processes', () => {
    const r = createRegistry({ maxPerChat: 2 })
    expect(r.canAdd('c1')).toBe(true)
    r.add({ id: 'p1', chatId: 'c1', command: 'a' })
    r.add({ id: 'p2', chatId: 'c1', command: 'b' })
    expect(r.canAdd('c1')).toBe(false)
    expect(r.canAdd('c2')).toBe(true)
  })
})
