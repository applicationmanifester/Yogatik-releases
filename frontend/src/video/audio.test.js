import { describe, it, expect } from 'vitest'
import { mixPcm, applyEdgeFades, planNarration, captionCues, cueAt } from './audio'
import { cleanForSpeech, estimateSpeechSeconds } from './speech'

const tone = (n, v = 0.5) => Float32Array.from({ length: n }, () => v)

describe('mixPcm', () => {
  it('lays each clip at its offset on a silent bed', () => {
    const out = mixPcm([{ pcm: tone(4), startSec: 1 }], 4, 3)
    expect(out.length).toBe(12)
    expect(Array.from(out.slice(0, 4))).toEqual([0, 0, 0, 0])
    expect(Array.from(out.slice(4, 8))).toEqual([0.5, 0.5, 0.5, 0.5])
  })

  it('never writes past the end of the video', () => {
    const out = mixPcm([{ pcm: tone(100), startSec: 0.9 }], 10, 1)
    expect(out.length).toBe(10)
    expect(out.every(Number.isFinite)).toBe(true)
  })

  it('normalises only when overlapping clips would clip', () => {
    const quiet = mixPcm([{ pcm: tone(4, 0.4), startSec: 0 }], 4, 1)
    expect(quiet[0]).toBeCloseTo(0.4, 5)          // untouched
    const loud = mixPcm([
      { pcm: tone(4, 0.8), startSec: 0 },
      { pcm: tone(4, 0.8), startSec: 0 },
    ], 4, 1)
    expect(Math.max(...loud)).toBeCloseTo(1, 5)   // scaled down, not distorted
  })
})

describe('applyEdgeFades', () => {
  it('ramps both ends so clips do not click', () => {
    const pcm = applyEdgeFades(tone(100), 1000, 20)
    expect(pcm[0]).toBe(0)
    expect(pcm[pcm.length - 1]).toBe(0)
    expect(pcm[50]).toBeCloseTo(0.5, 5)
  })
})

describe('planNarration', () => {
  it('stretches a scene to fit a line that outruns it', () => {
    const { durations } = planNarration([{ seconds: 3, speechSec: 6 }], { lead: 0.35, tail: 0.45 })
    expect(durations[0]).toBeCloseTo(6.8, 5)
  })

  it('never shortens a scene the author sized deliberately', () => {
    const { durations } = planNarration([{ seconds: 10, speechSec: 2 }])
    expect(durations[0]).toBe(10)
  })

  it('leaves silent scenes and their timing alone', () => {
    const { durations, starts, totalSec } = planNarration([
      { seconds: 4, speechSec: 0 },
      { seconds: 2, speechSec: 3 },
    ])
    expect(durations[0]).toBe(4)
    expect(starts[0]).toBeNull()
    expect(starts[1]).toBeCloseTo(4.35, 5)   // after scene 1, plus lead-in
    expect(totalSec).toBeCloseTo(4 + 3.8, 5)
  })
})

describe('captions', () => {
  it('splits narration into cues that tile the scene', () => {
    const cues = captionCues('One two. Three four five!', 10)
    expect(cues).toHaveLength(2)
    expect(cues[0].start).toBe(0)
    expect(cues[cues.length - 1].end).toBeCloseTo(10, 5)
  })

  it('gives longer sentences more screen time', () => {
    const [short, long] = captionCues('Hi. A considerably longer sentence here.', 10)
    expect(long.end - long.start).toBeGreaterThan(short.end - short.start)
  })

  it('finds the cue on screen at a moment', () => {
    const cues = captionCues('One. Two.', 10)
    expect(cueAt(cues, 0).text).toBe('One.')
    expect(cueAt(cues, 9.9).text).toBe('Two.')
    expect(cueAt([], 1)).toBeNull()
  })
})

describe('speech text preparation', () => {
  it('strips what only makes sense on a page', () => {
    expect(cleanForSpeech('See **this** [link](https://x.com) and `code`')).toBe('See this link and code')
    expect(cleanForSpeech('```js\nconst a = 1\n```\nDone')).toBe('Done')
  })

  it('estimates duration from word count', () => {
    expect(estimateSpeechSeconds('')).toBe(0)
    const ten = estimateSpeechSeconds('one two three four five six seven eight nine ten')
    expect(ten).toBeGreaterThan(3)
    expect(ten).toBeLessThan(5)
    expect(estimateSpeechSeconds('one two three', 1.5)).toBeLessThan(estimateSpeechSeconds('one two three', 1))
  })
})
