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
  it('strips a handler on the ROOT svg element, not just on descendants', () => {
    // querySelectorAll('*') never matches the node it is called on, so the root
    // — the one element an attacker fully controls here — was skipped.
    const out = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect/></svg>')
    expect(out).not.toMatch(/onload/i)
    expect(out).toMatch(/rect/)
  })
  it('strips a javascript: url on the root', () => {
    const out = sanitizeSvg('<svg xmlns="http://www.w3.org/2000/svg" href="javascript:alert(1)"><rect/></svg>')
    expect(out).not.toMatch(/javascript:/i)
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
  it('skips the nudge right after a real backup, not just after a nudge', () => {
    const now = 1_000_000_000_000
    expect(shouldNudgeBackup({ persisted: false, conversationCount: 9, lastBackupAt: now - 1000, now })).toBe(false)
    expect(shouldNudgeBackup({ persisted: false, conversationCount: 9, lastBackupAt: now - 8 * 24 * 3600 * 1000, now })).toBe(true)
  })
})

describe('getEvictionSafety', () => {
  it('reports best-effort + warn when persist() is unavailable', async () => {
    const { getEvictionSafety } = await import('./storage')
    const s = await getEvictionSafety(9)
    // jsdom/node tests have no navigator.storage → not persisted → warn.
    expect(s.bestEffort).toBe(true)
    expect(s.warn).toBe(true)
    expect(typeof s.nudgeDue).toBe('boolean')
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
  it('labels every heavy feature with its blocking Download-N-MB size', async () => {
    const { KNOWN_SIZES, consentMessage } = await import('./downloadConsent')
    // Sprint 2 contract: VLM/detection ~40MB, embeddings ~23MB (up to ~230MB
    // with a large corpus), WebLLM ~350MB — each prompt is blocking + sized.
    expect(KNOWN_SIZES.objectDetection).toBe(40)
    expect(KNOWN_SIZES.semanticSearch).toBe(23)
    expect(KNOWN_SIZES.localLLM).toBe(350)
    expect(consentMessage('objectDetection')).toMatch(/Download .*40.*MB/)
    expect(consentMessage('localLLM')).toMatch(/Download .*350.*MB/)
    expect(consentMessage('semanticSearch')).toMatch(/23MB/)
    expect(consentMessage('semanticSearch')).toMatch(/230MB/)
  })
  it('remembers consent per feature and mirrors the toggle into features', async () => {
    for (const f of ['objectDetection', 'semanticSearch', 'localLLM']) revokeConsent(f)
    setConsentPrompter(async () => true)
    expect(await ensureDownloadConsent('objectDetection')).toBe(true)
    expect(hasConsent('objectDetection')).toBe(true)
    // Per-feature memory: granting detection must not grant anything else.
    expect(hasConsent('localLLM')).toBe(false)
    expect(hasConsent('semanticSearch')).toBe(false)
    const stored = JSON.parse(localStorage.getItem('yogatik.features') || '{}')
    expect(stored.liveObjectDetection).toBe(true)
  })
  it('passes blocking metadata to the prompter so the UI can modal-block', async () => {
    revokeConsent('localLLM')
    let meta = null
    setConsentPrompter(async (_msg, info) => { meta = info; return true })
    await ensureDownloadConsent('localLLM')
    expect(meta).toMatchObject({ feature: 'localLLM', sizeMb: 350, blocking: true })
  })
})
