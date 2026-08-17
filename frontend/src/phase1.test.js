import { describe, it, expect, beforeEach, vi } from 'vitest'
import { deriveProcedural, aggregateSignals } from './adaptation'
import { hashString, assignVariant, getVariant, _resetExperiments } from './experiments'
import { createPostHogSink } from './analyticsSink'

describe('adaptation.deriveProcedural', () => {
  it('needs enough evidence before asserting length preference', () => {
    expect(deriveProcedural({ userMsgLengths: [10, 10] })).toEqual([])
  })
  it('detects short-message preference', () => {
    const out = deriveProcedural({ userMsgLengths: [10, 20, 15, 25] })
    expect(out.some(p => /concise/.test(p.text))).toBe(true)
  })
  it('detects detailed-message preference', () => {
    const out = deriveProcedural({ userMsgLengths: [300, 400, 250, 500] })
    expect(out.some(p => /thorough/.test(p.text))).toBe(true)
  })
  it('surfaces a dominant tool', () => {
    const out = deriveProcedural({ toolCounts: { web_search: 5, calculator: 1 } })
    expect(out.some(p => /web_search/.test(p.text))).toBe(true)
  })
  it('aggregateSignals rolls up events', () => {
    const s = aggregateSignals([{ userLen: 10, tool: 'a' }, { userLen: 20, tool: 'a' }])
    expect(s.userMsgLengths).toEqual([10, 20])
    expect(s.toolCounts.a).toBe(2)
  })
})

describe('experiments', () => {
  beforeEach(() => _resetExperiments())
  it('hash is deterministic', () => {
    expect(hashString('abc')).toBe(hashString('abc'))
  })
  it('assignment is stable per unit', () => {
    const a = assignVariant('exp1', 'user42', ['A', 'B'])
    const b = assignVariant('exp1', 'user42', ['A', 'B'])
    expect(a).toBe(b)
    expect(['A', 'B']).toContain(a)
  })
  it('respects weights (roughly)', () => {
    let a = 0
    for (let i = 0; i < 1000; i++) if (assignVariant('e', `u${i}`, [{ name: 'A', weight: 9 }, { name: 'B', weight: 1 }]) === 'A') a++
    expect(a).toBeGreaterThan(800) // ~90%
  })
  it('disabled experiment returns null', () => {
    expect(getVariant({ id: 'x', variants: ['A', 'B'], enabled: false })).toBe(null)
  })
})

describe('analyticsSink', () => {
  beforeEach(() => { globalThis.localStorage = { getItem: () => null, setItem: () => {} } })
  it('requires host + key', () => {
    expect(createPostHogSink({})).toBe(null)
    expect(createPostHogSink({ host: 'https://x', projectKey: 'k' })).toBeTruthy()
  })
  it('batches and flushes via fetch', async () => {
    const calls = []
    globalThis.fetch = vi.fn((url, opts) => { calls.push(JSON.parse(opts.body)); return Promise.resolve({}) })
    const sink = createPostHogSink({ host: 'https://x', projectKey: 'k' })
    for (let i = 0; i < 20; i++) sink.capture('e', { tool: 't' })
    await sink.flush()
    expect(calls.length).toBeGreaterThanOrEqual(1)
    expect(calls[0].api_key).toBe('k')
  })
})
