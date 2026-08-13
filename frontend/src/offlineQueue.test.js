import { describe, it, expect, beforeEach, vi } from 'vitest'
import { enqueueOutbox, getOutbox, outboxSize, clearOutbox, flushOutbox } from './offlineQueue'

describe('offline outbox', () => {
  beforeEach(() => clearOutbox())

  it('queues non-empty messages and ignores blanks', () => {
    enqueueOutbox('hello'); enqueueOutbox('   '); enqueueOutbox('world')
    expect(getOutbox().map(i => i.text)).toEqual(['hello', 'world'])
    expect(outboxSize()).toBe(2)
  })

  it('flushes oldest-first and empties the queue', async () => {
    enqueueOutbox('a'); enqueueOutbox('b')
    const seen = []
    const n = await flushOutbox(async (t) => { seen.push(t) }, () => true)
    expect(seen).toEqual(['a', 'b'])
    expect(n).toBe(2)
    expect(outboxSize()).toBe(0)
  })

  it('re-queues a failing send and stops (no infinite loop)', async () => {
    enqueueOutbox('boom'); enqueueOutbox('later')
    const fn = vi.fn(async () => { throw new Error('offline again') })
    const n = await flushOutbox(fn, () => true)
    expect(n).toBe(0)
    expect(fn).toHaveBeenCalledTimes(1)          // stopped after the first failure
    expect(getOutbox().map(i => i.text)).toEqual(['later', 'boom'])  // failed one re-queued at back
  })

  it('stops immediately if it goes offline again', async () => {
    enqueueOutbox('x')
    const n = await flushOutbox(async () => {}, () => false)
    expect(n).toBe(0)
    expect(outboxSize()).toBe(1)
  })
})
