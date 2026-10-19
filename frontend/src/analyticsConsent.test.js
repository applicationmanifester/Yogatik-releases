import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  enableAnalytics, disableAnalytics, isAnalyticsEnabled, track,
  trackToolSettled, latencyBucket,
} from './analytics'
import {
  isAnalyticsConsented, setAnalyticsConsent, ensureAnalytics,
} from './analyticsConsent'
import { startTurn, _resetTelemetry } from './telemetry'
import {
  startSession, markUtteranceEnd, markFirstWord, markTurnEnd, endSession,
  _resetLiveMetrics, END_REASON,
} from './live/metrics'

function clearLS() {
  try { localStorage.clear() } catch { /* jsdom always has it */ }
}

describe('Sprint 3 — opt-in analytics gate', () => {
  beforeEach(() => { clearLS(); disableAnalytics() })

  it('defaults OFF: consent absent and analytics disabled', () => {
    expect(isAnalyticsConsented()).toBe(false)
    expect(isAnalyticsEnabled()).toBe(false)
  })

  it('ensureAnalytics() stays off without consent, even with config', async () => {
    localStorage.setItem('yogatik_analytics_config', JSON.stringify({ host: 'https://x.example', projectKey: 'phc_1' }))
    expect(await ensureAnalytics()).toBe(false)
    expect(isAnalyticsEnabled()).toBe(false)
  })

  it('no events flow until the gate opens', async () => {
    const sink = { capture: vi.fn() }
    // Direct enable without consent still works at the primitive layer…
    enableAnalytics(sink)
    expect(isAnalyticsEnabled()).toBe(true)
    disableAnalytics()
    // …but the consent helper refuses to enable without host+key
    localStorage.setItem('yogatik_analytics_consent', '1')
    expect(await ensureAnalytics()).toBe(false)
  })

  it('setAnalyticsConsent(false) revokes and drops the sink', async () => {
    const sink = { capture: vi.fn() }
    enableAnalytics(sink)
    track('tool_settled', { tool: 'fs_read', ok: true })
    expect(sink.capture).toHaveBeenCalledTimes(1)
    await setAnalyticsConsent(false)
    expect(isAnalyticsConsented()).toBe(false)
    expect(isAnalyticsEnabled()).toBe(false)
    track('tool_settled', { tool: 'fs_read', ok: true })
    expect(sink.capture).toHaveBeenCalledTimes(1) // no further sends
  })
})

describe('Sprint 3 — event shape (counts/timings only, never content)', () => {
  beforeEach(() => { clearLS(); disableAnalytics(); _resetTelemetry(); _resetLiveMetrics() })

  it('tool_settled carries only allowlisted keys; content is stripped', () => {
    const sink = { capture: vi.fn() }
    enableAnalytics(sink)
    trackToolSettled('fs_read', 'success', 320, undefined)
    expect(sink.capture).toHaveBeenCalledWith('tool_settled', {
      tool: 'fs_read', ok: 'success', latencyBucket: '250ms-1s',
    })
    // A careless caller cannot smuggle content through:
    track('tool_settled', {
      tool: 'fs_read', ok: true, prompt: 'my secret question',
      content: 'full answer text', url: 'https://private.example',
    })
    const [, props] = sink.capture.mock.calls.at(-1)
    expect(props).toEqual({ tool: 'fs_read', ok: true })
    expect(JSON.stringify(props)).not.toMatch(/secret|private/)
  })

  it('latency buckets are coarse (no fingerprinting precision)', () => {
    expect(latencyBucket(0)).toBe('<250ms')
    expect(latencyBucket(249)).toBe('<250ms')
    expect(latencyBucket(999)).toBe('250ms-1s')
    expect(latencyBucket(3999)).toBe('1-4s')
    expect(latencyBucket(9999)).toBe('4-10s')
    expect(latencyBucket(60000)).toBe('>10s')
    expect(latencyBucket(-1)).toBe('unknown')
  })

  it('turn_latency forwards a bucketed, content-free event when opted in', () => {
    const sink = { capture: vi.fn() }
    enableAnalytics(sink)
    const turn = startTurn({ provider: 'groq' })
    turn.firstToken()
    turn.done()
    const call = sink.capture.mock.calls.find(([e]) => e === 'turn_latency')
    expect(call).toBeTruthy()
    const [, props] = call
    expect(props.provider).toBe('groq')
    expect(typeof props.latencyBucket).toBe('string')
    expect(Object.keys(props).sort()).toEqual(['latencyBucket', 'provider'])
  })

  it('live_session end emits counts + bucket, never transcripts', () => {
    const sink = { capture: vi.fn() }
    enableAnalytics(sink)
    startSession({ engine: 'webrtc', provider: 'gemini' }, 1000)
    markUtteranceEnd(2000)
    markFirstWord(2300)
    markTurnEnd()
    const ended = endSession(END_REASON.USER, 60_000)
    expect(ended.turns).toBe(1)
    const call = sink.capture.mock.calls.find(([e]) => e === 'live_session')
    expect(call).toBeTruthy()
    const [, props] = call
    expect(props.ok).toBe(true)
    expect(props.count).toBe(1)
    expect(typeof props.latencyBucket).toBe('string')
    expect(props).not.toHaveProperty('transcript')
    expect(JSON.stringify(props)).not.toMatch(/utterance|audio/i)
  })

  it('a broken sink never throws into the app', () => {
    enableAnalytics({ capture() { throw new Error('downstream on fire') } })
    expect(() => {
      track('x', { tool: 't' })
      trackToolSettled('t', true, 10)
      const turn = startTurn({})
      turn.firstToken(); turn.done()
    }).not.toThrow()
  })
})
