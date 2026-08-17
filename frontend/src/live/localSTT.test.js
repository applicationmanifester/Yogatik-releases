import { describe, it, expect } from 'vitest'
import {
  rms, isSilent, shouldCloseSegment, segmentIsUsable,
  SILENCE_RMS, TRAILING_SILENCE_MS, MAX_SEGMENT_MS, MIN_SEGMENT_MS,
} from './localSTT'
import { classifySpeechError, NETWORK_FAILS_BEFORE_LOCAL } from './cascade'

const frame = (amp, n = 512) => Float32Array.from({ length: n }, (_, i) => amp * Math.sin(i / 4))

describe('rms / isSilent', () => {
  it('measures a loud frame above the silence floor', () => {
    expect(rms(frame(0.3))).toBeGreaterThan(SILENCE_RMS)
    expect(isSilent(rms(frame(0.3)))).toBe(false)
  })

  it('treats room tone as silence', () => {
    expect(isSilent(rms(frame(0.002)))).toBe(true)
  })

  it('survives an empty or bogus frame instead of throwing', () => {
    expect(rms(new Float32Array(0))).toBe(0)
    expect(rms(null)).toBe(0)
    expect(isSilent(NaN)).toBe(true)
  })
})

describe('shouldCloseSegment', () => {
  it('does not close before anything has been said', () => {
    // Otherwise a silent room emits empty segments forever.
    expect(shouldCloseSegment({ speechStarted: false, silenceMs: 99999, segmentMs: 99999 })).toBe(false)
  })

  it('closes after trailing silence', () => {
    expect(shouldCloseSegment({ speechStarted: true, silenceMs: TRAILING_SILENCE_MS, segmentMs: 3000 })).toBe(true)
  })

  it('keeps listening through a short pause mid-sentence', () => {
    expect(shouldCloseSegment({ speechStarted: true, silenceMs: 200, segmentMs: 3000 })).toBe(false)
  })

  it('force-closes a monologue at the cap', () => {
    // Whisper degrades on long audio, and a caller who never pauses still
    // deserves an answer.
    expect(shouldCloseSegment({ speechStarted: true, silenceMs: 0, segmentMs: MAX_SEGMENT_MS })).toBe(true)
  })
})

describe('segmentIsUsable', () => {
  it('rejects a blip too short to be a word', () => {
    expect(segmentIsUsable({ segmentMs: MIN_SEGMENT_MS - 1, peakRms: 0.5 })).toBe(false)
  })

  it('rejects a long stretch that never rose above noise', () => {
    expect(segmentIsUsable({ segmentMs: 5000, peakRms: 0.001 })).toBe(false)
  })

  it('accepts real speech', () => {
    expect(segmentIsUsable({ segmentMs: 1200, peakRms: 0.2 })).toBe(true)
  })
})

describe('classifySpeechError', () => {
  it('treats a blocked mic as fatal, not retryable', () => {
    expect(classifySpeechError('not-allowed', 0)).toBe('fatal')
    expect(classifySpeechError('service-not-allowed', 0)).toBe('fatal')
  })

  it('ignores the noise errors that fire constantly', () => {
    expect(classifySpeechError('no-speech', 0)).toBe('ignore')
    expect(classifySpeechError('aborted', 0)).toBe('ignore')
  })

  it('retries a network blip once, then falls back to on-device', () => {
    // The old code retried this forever with backoff, re-emitting the toast
    // each time — Web Speech is a CLOUD service, so an offline desktop never
    // recovers.
    expect(classifySpeechError('network', 0)).toBe('retry')
    expect(classifySpeechError('network', NETWORK_FAILS_BEFORE_LOCAL - 1)).toBe('fallback')
  })

  it('falls back on an unavailable service too', () => {
    expect(classifySpeechError('service-not-available', 1)).toBe('fallback')
  })

  it('retries anything unrecognised rather than giving up', () => {
    expect(classifySpeechError('audio-capture', 0)).toBe('retry')
  })
})
