import { describe, it, expect, beforeEach, vi } from 'vitest'
import { sanitizeHtml, sanitizeSvg } from './sanitize'
import { shouldNudgeBackup } from './storage'
import { latencyBucket, track, enableAnalytics, disableAnalytics, isAnalyticsEnabled } from './analytics'
import { ensureDownloadConsent, setConsentPrompter, hasConsent, grantConsent, revokeConsent } from './downloadConsent'

describe('sanitize', () => {
  it('strips script tags and event handlers from HTML', () => {
    const out = sanitizeHtml('<div onclick="evil()">hi<script>alert(1)</script></div>')
    expect(out).not.toMatch(/script/i)
    expect(out).not.toMatch(/onclick/i)
    expect(out).toMatch(/hi/)
  })
  it('strips javascript: URLs', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a>')
    expect(out).not.toMatch(/javascript:/i)
  })
  it('rejects non-svg roots', () => {
    expect(sanitizeSvg('<div>nope</div>')).toBe('')
  })
  it('keeps a clean svg', () => {
    const out = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect width="1" height="1"/></svg>')
    expect(out).toMatch(/rect/)
  })
})

describe('shouldNudgeBackup', () => {
  it('never nudges when storage is persisted', () => {
    expect(shouldNudgeBackup({ persisted: true, conversationCount: 100 })).toBe(false)
  })
  it('waits for a few conversations', () => {
    expect(shouldNudgeBackup({ persisted: false, conversationCount: 2 })).toBe(false)
    expect(shouldNudgeBackup({ persisted: false, conversationCount: 6 })).toBe(true)
  })
  it('respects the weekly interval', () => {
    const now = 1_000_000_000_000
    expect(shouldNudgeBackup({ persisted: false, conversationCount: 6, lastNudgeAt: now - 1000, now })).toBe(false)
  })
})

describe('analytics (opt-in)', () => {
  beforeEach(() => disableAnalytics())
  it('buckets latency', () => {
    expect(latencyBucket(100)).toBe('<250ms')
    expect(latencyBucket(5000)).toBe('4-10s')
  })
  it('is a no-op until enabled', () => {
    const sink = { capture: vi.fn() }
    track('x', { tool: 'a' })
    expect(sink.capture).not.toHaveBeenCalled()
    enableAnalytics(sink)
    expect(isAnalyticsEnabled()).toBe(true)
    track('x', { tool: 'a', secretText: 'leak' })
    expect(sink.capture).toHaveBeenCalledWith('x', { tool: 'a' }) // secretText dropped
  })
})

describe('downloadConsent', () => {
  beforeEach(() => { revokeConsent('localVision') })
  it('remembers a granted feature', () => {
    grantConsent('localVision')
    expect(hasConsent('localVision')).toBe(true)
  })
  it('prompts once then remembers, and includes the size', async () => {
    revokeConsent('localVision')
    let asked = ''
    setConsentPrompter(async (msg) => { asked = msg; return true })
    const ok = await ensureDownloadConsent('localVision')
    expect(ok).toBe(true)
    expect(asked).toMatch(/230MB/)
    expect(hasConsent('localVision')).toBe(true)
  })
  it('returns false when declined', async () => {
    revokeConsent('semanticSearch')
    setConsentPrompter(async () => false)
    expect(await ensureDownloadConsent('semanticSearch')).toBe(false)
  })
})
