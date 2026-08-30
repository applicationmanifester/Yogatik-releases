import { describe, it, expect } from 'vitest'
import {
  isEcho, endpointDelay, parseVoiceCommand, stripWakeWord,
  shouldRejectNoise, trimHistoryPairs,
} from './cascade'

describe('echo guard', () => {
  it('recognises the synthesiser being picked up by the microphone', () => {
    const spoken = 'Sure, the kettle is on the left side of the counter.'
    expect(isEcho('the kettle is on the left', spoken)).toBe(true)
    expect(isEcho('Sure the kettle is on the left side', spoken)).toBe(true)
  })

  it('lets a real interruption through', () => {
    const spoken = 'Sure, the kettle is on the left side of the counter.'
    expect(isEcho('no wait, stop', spoken)).toBe(false)
    expect(isEcho('what about the fridge', spoken)).toBe(false)
  })

  it('is inert when nothing is being spoken', () => {
    expect(isEcho('hello there', '')).toBe(false)
    expect(isEcho('', 'anything')).toBe(false)
  })
})

describe('adaptive endpointing', () => {
  it('commits a finished-sounding sentence fastest', () => {
    expect(endpointDelay('what time is it?')).toBe(200)
  })
  it('commits a long phrase sooner than a short fragment', () => {
    const long = endpointDelay('can you tell me what the weather is like today outside')
    const short = endpointDelay('um')
    expect(long).toBeLessThan(short)
  })
  it('gives extra pause time when the utterance ends with a connector', () => {
    expect(endpointDelay('I wanted to check this because')).toBe(650)
    expect(endpointDelay('We can deploy now and')).toBe(650)
  })
})

describe('voice commands', () => {
  it('recognises control words as whole utterances', () => {
    expect(parseVoiceCommand('stop')).toEqual({ type: 'stop' })
    expect(parseVoiceCommand('pause')).toEqual({ type: 'pause' })
    expect(parseVoiceCommand('resume')).toEqual({ type: 'resume' })
    expect(parseVoiceCommand('repeat that')).toEqual({ type: 'repeat' })
    expect(parseVoiceCommand('slow down')).toEqual({ type: 'rate', delta: -0.15 })
    expect(parseVoiceCommand('speak faster')).toEqual({ type: 'rate', delta: 0.15 })
  })
  it('maps a language switch', () => {
    expect(parseVoiceCommand('speak in spanish')).toEqual({ type: 'language', lang: 'es-ES', name: 'spanish' })
    expect(parseVoiceCommand('switch to french')).toEqual({ type: 'language', lang: 'fr-FR', name: 'french' })
  })
  it('treats normal speech as content, not commands', () => {
    expect(parseVoiceCommand('stop the car please')).toBe(null)
    expect(parseVoiceCommand('what is the capital of Peru')).toBe(null)
  })
})

describe('wake word', () => {
  it('passes everything through when no wake word is set', () => {
    expect(stripWakeWord('hello there')).toEqual({ matched: true, rest: 'hello there' })
  })
  it('strips a leading wake word', () => {
    expect(stripWakeWord('hey yogatik what time is it', 'hey yogatik'))
      .toEqual({ matched: true, rest: 'what time is it' })
  })
  it('rejects an utterance without the wake word', () => {
    expect(stripWakeWord('what time is it', 'hey yogatik').matched).toBe(false)
  })
})

describe('noise gate', () => {
  it('drops a short low-confidence final (background chatter)', () => {
    expect(shouldRejectNoise('uh', 0.2)).toBe(true)
  })
  it('keeps a short final when confidence is unknown (Chrome reports 0)', () => {
    expect(shouldRejectNoise('yes', 0)).toBe(false)
  })
  it('keeps a normal confident phrase', () => {
    expect(shouldRejectNoise('turn on the light', 0.9)).toBe(false)
  })
})

describe('history pairing', () => {
  it('keeps the trimmed window aligned to a user turn', () => {
    const h = [
      { role: 'user', content: 'a' }, { role: 'assistant', content: 'A' },
      { role: 'user', content: 'b' }, { role: 'assistant', content: 'B' },
      { role: 'user', content: 'c' }, { role: 'assistant', content: 'C' },
    ]
    const trimmed = trimHistoryPairs(h, 3)
    expect(trimmed.length).toBeLessThanOrEqual(3)
    expect(trimmed[0].role).toBe('user') // never a bare leading assistant
  })
})
