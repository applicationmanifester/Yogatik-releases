import { describe, it, expect } from 'vitest'
import {
  contextChanged, shouldObserve, shouldSpeak, buildObservationPrompt, isSilentReply,
  OBSERVE_INTERVAL_MS, SPEAK_COOLDOWN_MS, SETTLE_MS, MAX_PROACTIVE_PER_SESSION,
} from './companionAwareness'

const T = 1_000_000

describe('contextChanged', () => {
  it('fires when the user switches application', () => {
    expect(contextChanged({ appName: 'Code', title: 'a.js' }, { appName: 'Chrome', title: 'a.js' })).toBe(true)
  })

  it('fires on the first sample', () => {
    expect(contextChanged(null, { appName: 'Code', title: 'a.js' })).toBe(true)
  })

  it('ignores an unsaved-changes marker appearing', () => {
    // Otherwise the companion pipes up on the first keystroke in every file.
    expect(contextChanged({ appName: 'Code', title: 'a.js' }, { appName: 'Code', title: '• a.js' })).toBe(false)
  })

  it('ignores a moving line:column readout', () => {
    expect(contextChanged(
      { appName: 'Code', title: 'a.js 12:4' },
      { appName: 'Code', title: 'a.js 340:18' },
    )).toBe(false)
  })

  it('ignores an unread badge ticking up', () => {
    expect(contextChanged({ appName: 'Slack', title: 'general (2)' }, { appName: 'Slack', title: 'general (7)' })).toBe(false)
  })

  it('still fires on a real document change in the same app', () => {
    expect(contextChanged({ appName: 'Code', title: 'a.js' }, { appName: 'Code', title: 'billing.py' })).toBe(true)
  })

  it('does not fire on an empty sample', () => {
    expect(contextChanged({ appName: 'Code', title: 'a.js' }, {})).toBe(false)
  })
})

describe('shouldObserve', () => {
  const base = { enabled: true, open: true, streaming: false, now: T, lastObservedAt: T - OBSERVE_INTERVAL_MS }

  it('samples on the interval', () => {
    expect(shouldObserve(base)).toBe(true)
  })

  it('does not sample when disabled or closed', () => {
    expect(shouldObserve({ ...base, enabled: false })).toBe(false)
    expect(shouldObserve({ ...base, open: false })).toBe(false)
  })

  it('does not sample while it is already answering', () => {
    expect(shouldObserve({ ...base, streaming: true })).toBe(false)
  })

  it('waits out the interval', () => {
    expect(shouldObserve({ ...base, lastObservedAt: T - 1000 })).toBe(false)
  })
})

describe('shouldSpeak', () => {
  const base = {
    changed: true, settledMs: SETTLE_MS, streaming: false, userTyping: false,
    now: T, lastSpokeAt: null, spokenCount: 0,
  }

  it('speaks when the context really changed and settled', () => {
    expect(shouldSpeak(base)).toBe(true)
  })

  it('says nothing when nothing changed', () => {
    expect(shouldSpeak({ ...base, changed: false })).toBe(false)
  })

  it('does not talk over its own answer', () => {
    expect(shouldSpeak({ ...base, streaming: true })).toBe(false)
  })

  it('does not interrupt someone mid-sentence in the composer', () => {
    expect(shouldSpeak({ ...base, userTyping: true })).toBe(false)
  })

  it('does not narrate a fast flick between windows', () => {
    expect(shouldSpeak({ ...base, settledMs: 500 })).toBe(false)
  })

  it('honours the cooldown however much changes', () => {
    expect(shouldSpeak({ ...base, lastSpokeAt: T - 1000 })).toBe(false)
    expect(shouldSpeak({ ...base, lastSpokeAt: T - SPEAK_COOLDOWN_MS })).toBe(true)
  })

  it('stops entirely once the session cap is reached', () => {
    // A busy day must not turn into a wall of unprompted messages.
    expect(shouldSpeak({ ...base, spokenCount: MAX_PROACTIVE_PER_SESSION })).toBe(false)
  })
})

describe('buildObservationPrompt', () => {
  it('names where the user is', () => {
    expect(buildObservationPrompt({ appName: 'Code', title: 'billing.py' })).toContain('Code — billing.py')
  })

  it('states plainly that the user did not ask', () => {
    expect(buildObservationPrompt({})).toMatch(/did not ask/i)
  })

  it('licenses silence explicitly', () => {
    // Asked "what does the user need?", a model always finds something. The
    // opt-out has to be spelled out or it comments on everything.
    const p = buildObservationPrompt({ appName: 'Chrome' })
    expect(p).toContain('SILENT')
    expect(p).toMatch(/silence is the correct answer/i)
  })
})

describe('isSilentReply', () => {
  it('recognises the sentinel and its polite wrappings', () => {
    expect(isSilentReply('SILENT')).toBe(true)
    expect(isSilentReply('  silent. ')).toBe(true)
    expect(isSilentReply('')).toBe(true)
  })

  it('lets a real observation through', () => {
    expect(isSilentReply('That stack trace points at a null config on line 14.')).toBe(false)
  })

  it('does not swallow a sentence that merely mentions silence', () => {
    expect(isSilentReply('The test asserts the logger stays silent on retry.')).toBe(false)
  })
})
