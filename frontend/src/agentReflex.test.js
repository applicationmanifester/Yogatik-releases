import { describe, it, expect } from 'vitest'
import { detectReflexCandidate, REFLEX_WHITELIST } from './agentReflex'

describe('agentReflex — whitelist', () => {
  it('is the small, deliberately conservative set, never web_search/social_search or anything side-effecting', () => {
    expect(REFLEX_WHITELIST).toEqual(['unit_convert', 'calculator', 'weather', 'timezone', 'translate'])
    expect(REFLEX_WHITELIST).not.toContain('web_search')
    expect(REFLEX_WHITELIST).not.toContain('social_search')
    expect(REFLEX_WHITELIST).not.toContain('fs_write')
    expect(REFLEX_WHITELIST).not.toContain('terminal_run')
  })
})

describe('agentReflex — unit_convert', () => {
  it('detects a clean value/unit/unit triple', () => {
    expect(detectReflexCandidate('convert 5 km to miles')).toEqual({
      name: 'unit_convert', args: { value: 5, from: 'km', to: 'mi' },
    })
    expect(detectReflexCandidate('100 f in c')).toEqual({
      name: 'unit_convert', args: { value: 100, from: 'f', to: 'c' },
    })
    expect(detectReflexCandidate('10kg into lb')).toEqual({
      name: 'unit_convert', args: { value: 10, from: 'kg', to: 'lb' },
    })
  })

  it('never guesses an unknown unit or a same-unit no-op', () => {
    expect(detectReflexCandidate('5 gronk to miles')).toBeNull()
    expect(detectReflexCandidate('5 km to km')).toBeNull()
  })
})

describe('agentReflex — calculator', () => {
  it('detects a clean numeric expression after an explicit trigger', () => {
    expect(detectReflexCandidate('what is 12 * (7+3)')).toEqual({
      name: 'calculator', args: { expression: '12 * (7+3)' },
    })
    expect(detectReflexCandidate('calculate 45/9-2')).toEqual({
      name: 'calculator', args: { expression: '45/9-2' },
    })
    expect(detectReflexCandidate('compute sqrt(144) + 2^3')).toEqual({
      name: 'calculator', args: { expression: 'sqrt(144) + 2^3' },
    })
  })

  it('refuses anything containing words it cannot vouch for, rather than guessing', () => {
    // Ordinary prose that happens to contain a number must never fire — a
    // wrong trigger here would run a doomed calculator call for nothing.
    expect(detectReflexCandidate('what is the population of 5 cities in Japan')).toBeNull()
    expect(detectReflexCandidate('what is the meaning of life')).toBeNull()
  })
})

describe('agentReflex — weather', () => {
  it('detects an explicitly named place', () => {
    expect(detectReflexCandidate('weather in Tokyo')).toEqual({
      name: 'weather', args: { location: 'Tokyo' },
    })
    expect(detectReflexCandidate("what's the forecast for Paris?")).toEqual({
      name: 'weather', args: { location: 'Paris' },
    })
  })

  it('never resolves to device location — that would pop a permission prompt before the model was asked', () => {
    expect(detectReflexCandidate('weather here')).toBeNull()
    expect(detectReflexCandidate('what is the weather today')).toBeNull()
    expect(detectReflexCandidate('weather')).toBeNull()
  })
})

describe('agentReflex — timezone', () => {
  it('resolves a known city to its IANA zone', () => {
    expect(detectReflexCandidate('what time is it in Tokyo')).toEqual({
      name: 'timezone', args: { to: ['Asia/Tokyo'] },
    })
    expect(detectReflexCandidate('current time in London')).toEqual({
      name: 'timezone', args: { to: ['Europe/London'] },
    })
  })

  it('never guesses an unmapped city', () => {
    expect(detectReflexCandidate('what time is it in Wakanda')).toBeNull()
  })
})

describe('agentReflex — translate', () => {
  it('detects the literal "translate X to <language>" phrasing', () => {
    expect(detectReflexCandidate('translate hello to spanish')).toEqual({
      name: 'translate', args: { text: 'hello', target: 'es' },
    })
    expect(detectReflexCandidate('translate "good morning" into french')).toEqual({
      name: 'translate', args: { text: 'good morning', target: 'fr' },
    })
  })

  it('never guesses an unmapped language', () => {
    expect(detectReflexCandidate('translate hello to klingon')).toBeNull()
  })

  it('leaves other phrasings ("how do you say...") to the model, deliberately', () => {
    expect(detectReflexCandidate('how do you say hello in spanish')).toBeNull()
  })
})

describe('agentReflex — detectReflexCandidate guardrails', () => {
  it('returns null for empty, non-string, or overlong messages', () => {
    expect(detectReflexCandidate('')).toBeNull()
    expect(detectReflexCandidate('   ')).toBeNull()
    expect(detectReflexCandidate(null)).toBeNull()
    expect(detectReflexCandidate(undefined)).toBeNull()
    expect(detectReflexCandidate('convert 5 km to miles ' + 'x'.repeat(400))).toBeNull()
  })

  it('returns null for ordinary conversational messages with no confident match', () => {
    expect(detectReflexCandidate('tell me about the history of Rome')).toBeNull()
    expect(detectReflexCandidate('write me a poem about the ocean')).toBeNull()
    expect(detectReflexCandidate('help me debug this error')).toBeNull()
  })

  it('returns at most one candidate even if a message could loosely resemble two', () => {
    const hit = detectReflexCandidate('convert 5 km to miles')
    expect(hit).not.toBeNull()
    expect(Object.keys(hit)).toEqual(['name', 'args'])
  })
})
