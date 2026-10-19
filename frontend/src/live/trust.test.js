import { describe, it, expect } from 'vitest'
import { cameraGuard, resolveCameraAction } from './guard'
import { honestFrameNote } from './visionGuard'

describe('cameraGuard (blind-model trap)', () => {
  it('blocks the camera for a text-only model with a one-line why', () => {
    const r = cameraGuard(false)
    expect(r.allowed).toBe(false)
    expect(typeof r.reason).toBe('string')
    expect(r.reason.length).toBeGreaterThan(10)
    expect(r.reason).toMatch(/cannot see|vision/i)
  })

  it('allows the camera when the model can see or capability is unknown', () => {
    expect(cameraGuard(true)).toEqual({ allowed: true, reason: null })
    expect(cameraGuard(null).allowed).toBe(true)
    expect(cameraGuard(undefined).allowed).toBe(true)
  })
})

describe('resolveCameraAction (auto-switch vs block — Horizon 1, final item)', () => {
  it('lets the camera proceed when the active model is not a KNOWN text-only one', () => {
    expect(resolveCameraAction({ canSee: true })).toEqual({ action: 'proceed', model: null, reason: null })
    expect(resolveCameraAction({ canSee: null }).action).toBe('proceed')
    expect(resolveCameraAction({}).action).toBe('proceed')
  })

  it('switches to a candidate whose probe/cached verdict resolved to vision', () => {
    const r = resolveCameraAction({
      canSee: false,
      candidates: [{ model: 'llama-guard-4-12b', canSee: false }, { model: 'qwen2.5-vl-72b-instruct', canSee: true }],
    })
    expect(r.action).toBe('switch')
    expect(r.model).toBe('qwen2.5-vl-72b-instruct')
    expect(r.reason).toBeNull()
  })

  it('uses a cached-or-confirmed candidate, not a bare name guess that failed its probe', () => {
    // Every candidate the caller passes here already carries its RESOLVED
    // verdict; a resolved false is not switchable, whatever its name says.
    const r = resolveCameraAction({ canSee: false, candidates: [{ model: 'gpt-4o-mini', canSee: false }] })
    expect(r.action).toBe('block')
    expect(r.reason).toMatch(/cannot see|vision/i)
  })

  it('keeps the teeth when no vision model was reachable (offline, empty list, failed probes)', () => {
    for (const candidates of [[], [{ model: 'deepseek-r1', canSee: false }]]) {
      const r = resolveCameraAction({ canSee: false, candidates })
      expect(r.action).toBe('block')
      expect(r.model).toBeNull()
      expect(r.reason).toMatch(/cannot see|vision/i)
    }
  })

  it('the toggle OFF preserves the strict block even when a switch is possible', () => {
    const r = resolveCameraAction({
      canSee: false,
      candidates: [{ model: 'qwen2.5-vl-72b-instruct', canSee: true }],
      allowSwitch: false,
    })
    expect(r.action).toBe('block')
    expect(r.model).toBeNull()
    expect(r.reason).toMatch(/cannot see|vision/i)
  })
})

describe('honestFrameNote (darkness/overexposure refusal)', () => {
  it('refuses a pitch-dark frame instead of guessing', () => {
    const note = honestFrameNote({ luma: { mean: 20, dark: 0.95, light: 0 } })
    expect(note).toBeTruthy()
    expect(note).toMatch(/dark|light/i)
  })

  it('refuses a washed-out frame', () => {
    const note = honestFrameNote({ luma: { mean: 200, dark: 0, light: 0.95 } })
    expect(note).toBeTruthy()
    expect(note).toMatch(/wash|light/i)
  })

  it('says nothing for a good frame', () => {
    expect(honestFrameNote({ luma: { mean: 130, dark: 0.1, light: 0.1 }, edgeDensity: 0.05 })).toBeNull()
  })

  it('does not block when there are no stats to judge by', () => {
    expect(honestFrameNote(null)).toBeNull()
  })

  it('refuses garbled OCR even on a readable frame', () => {
    const note = honestFrameNote(
      { luma: { mean: 130, dark: 0.1, light: 0.1 }, edgeDensity: 0.05 },
      { ocrText: 'Az Hoag d =', ocrConfidence: 12 },
    )
    expect(note).toBeTruthy()
  })
})
