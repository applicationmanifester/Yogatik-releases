// The companion after convergence: one capture layer, receipts for silence,
// and a prompt that carries memory without losing its behavioural rules.
//
// Only the pure halves are tested here — that is deliberate, and it is why
// pickScreenMode and describeCapabilities are exported separately from the
// controller that needs a MediaStream to exist.

import { describe, it, expect, vi } from 'vitest'
import { pickScreenMode, captureCapabilities, describeCapabilities } from './capture'
import { createTrail, describeEntry, summarize, KIND, CAPACITY } from './trail'
import { companionSystemPrompt, isSilence, SILENCE, PERSONAS } from './companionChat'

describe('capture capability', () => {
  it('prefers the desktop bridge, falls back to getDisplayMedia', () => {
    expect(pickScreenMode({ bridge: { captureScreen: () => {} }, displayMedia: true })).toBe('native')
    expect(pickScreenMode({ bridge: null, displayMedia: true })).toBe('display-media')
    expect(pickScreenMode({})).toBe(null)
  })

  it('a bridge object WITHOUT captureScreen is not a screen source', () => {
    // The old code tested for the bridge's existence and then called a method
    // that might not be there. An Electron build that exposes the companion
    // bridge for hotkeys alone must not claim it can capture.
    expect(pickScreenMode({ bridge: {}, displayMedia: false })).toBe(null)
  })

  it('a browser CAN watch a screen — the old view claimed otherwise', () => {
    const fakeWin = { navigator: { mediaDevices: { getDisplayMedia: () => {}, getUserMedia: () => {} } } }
    const caps = captureCapabilities(fakeWin)
    expect(caps.screen).toBe('display-media')
    expect(caps.camera).toBe(true)
  })

  it('reports honestly when there is nothing to capture with', () => {
    const caps = captureCapabilities({ navigator: {} })
    expect(caps).toEqual({ screen: null, camera: false })
    expect(describeCapabilities(caps)).toMatch(/No screen or camera/)
  })

  it('says WHAT it is watching, not just that it is', () => {
    expect(describeCapabilities({ screen: 'native' }, { watching: true })).toBe('Watching your screen')
    // A shared tab is not "your screen", and saying so would overstate what it sees.
    expect(describeCapabilities({ screen: 'display-media' }, { watching: true })).toBe('Watching the window you shared')
    expect(describeCapabilities({ screen: 'native' }, { watching: true, camera: true }))
      .toBe('Watching your screen and camera')
  })
})

describe('observation trail', () => {
  it('records looks, silence and speech separately', () => {
    const t = createTrail()
    t.look({ reason: 'the screen changed' })
    t.quiet('too soon after the last time it spoke')
    t.spoke('There is a type error on line 12.')
    const kinds = t.all().map(e => e.kind)
    expect(kinds).toEqual([KIND.LOOK, KIND.QUIET, KIND.SPOKE])
  })

  it('collapses a repeated skip instead of burying everything else', () => {
    const t = createTrail()
    t.look({ reason: 'first' })
    for (let i = 0; i < 30; i++) t.skip('Screen has not changed.')
    expect(t.all()).toHaveLength(2)
    expect(t.all()[1].count).toBe(30)
    // The interesting entry survived, which is the whole point.
    expect(t.all()[0].kind).toBe(KIND.LOOK)
  })

  it('does not collapse two different reasons', () => {
    const t = createTrail()
    t.skip('Screen has not changed.')
    t.skip('Hourly look budget spent.')
    expect(t.all()).toHaveLength(2)
  })

  it('is bounded — it is a trail, not a log file', () => {
    const t = createTrail()
    for (let i = 0; i < CAPACITY + 25; i++) t.spoke(`line ${i}`)
    expect(t.all()).toHaveLength(CAPACITY)
    expect(t.all()[t.all().length - 1].text).toBe(`line ${CAPACITY + 24}`)
  })

  it('a listener that throws cannot stop the loop', () => {
    const t = createTrail()
    t.subscribe(() => { throw new Error('bad listener') })
    const good = vi.fn()
    t.subscribe(good)
    expect(() => t.look({ reason: 'x' })).not.toThrow()
    expect(good).toHaveBeenCalled()
  })

  it('summarize distinguishes "nothing needed saying" from "nothing happened"', () => {
    expect(summarize([]).headline).toMatch(/Nothing looked at yet/)

    const watched = createTrail()
    watched.look({ reason: 'a' })
    watched.look({ reason: 'b' })
    // Looked twice, said nothing — the state a user reads as "it is broken".
    expect(summarize(watched.all()).headline).toBe('2 looks · nothing worth interrupting for')

    watched.spoke('hello')
    expect(summarize(watched.all()).headline).toBe('2 looks · spoke 1×')
  })

  it('describeEntry never renders an empty row', () => {
    for (const kind of Object.values(KIND)) {
      expect(describeEntry({ kind, reason: 'r', at: 0 })).toBeTruthy()
    }
    expect(describeEntry(null)).toBe('')
  })
})

describe('companion system prompt', () => {
  it('keeps the behavioural rules BEFORE the memory block', () => {
    const p = companionSystemPrompt({ watching: true, memory: 'MEMORY: the user prefers metric units.' })
    // A long recall block first would push the rules that keep it quiet and
    // honest out of a small model's attention.
    expect(p.indexOf('NOTHING-TO-ADD')).toBeLessThan(p.indexOf('MEMORY:'))
  })

  it('never claims to see when it is not watching', () => {
    const p = companionSystemPrompt({ watching: false })
    expect(p).toMatch(/never claim to see anything/i)
    expect(p).not.toMatch(/NOTHING-TO-ADD/)
  })

  it('describes acting only when it actually can', () => {
    expect(companionSystemPrompt({ canAct: true })).toMatch(/confirmed explicitly/)
    expect(companionSystemPrompt({ canAct: false })).not.toMatch(/confirmed explicitly/)
  })

  it('treats the floating window like the PiP surface', () => {
    expect(companionSystemPrompt({ surface: 'window' })).toMatch(/always-on-top/)
    expect(companionSystemPrompt({ surface: 'pip' })).toMatch(/always-on-top/)
    expect(companionSystemPrompt({ surface: 'panel' })).not.toMatch(/always-on-top/)
  })

  it('recognises the silence sentinel through the punctuation models add', () => {
    expect(isSilence(SILENCE)).toBe(true)
    expect(isSilence('"nothing to add."')).toBe(true)
    expect(isSilence('Nothing to add — the build passed.')).toBe(false)
  })

  it('injects selected persona instructions into system prompt', () => {
    expect(PERSONAS.pair).toBeDefined()
    expect(PERSONAS.security).toBeDefined()
    expect(PERSONAS.copilot).toBeDefined()
    expect(PERSONAS.concierge).toBeDefined()

    const pPair = companionSystemPrompt({ persona: 'pair' })
    expect(pPair).toMatch(/pair programmer/i)

    const pSec = companionSystemPrompt({ persona: 'security' })
    expect(pSec).toMatch(/security auditor/i)

    const pCopilot = companionSystemPrompt({ persona: 'copilot' })
    expect(pCopilot).toMatch(/quiet, minimal copilot/i)

    const pConcierge = companionSystemPrompt({ persona: 'concierge' })
    expect(pConcierge).toMatch(/executive assistant/i)
  })
})
