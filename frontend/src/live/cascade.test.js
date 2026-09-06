import { describe, it, expect } from 'vitest'
import {
  isEcho, endpointDelay, parseVoiceCommand, stripWakeWord,
  shouldRejectNoise, trimHistoryPairs, utteranceNeedsTools,
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
    expect(endpointDelay('what time is it?')).toBe(110)
  })
  it('commits a long phrase sooner than a short fragment', () => {
    const long = endpointDelay('can you tell me what the weather is like today outside')
    const short = endpointDelay('um')
    expect(long).toBeLessThan(short)
  })
  it('gives extra pause time when the utterance ends with a connector', () => {
    expect(endpointDelay('I wanted to check this because')).toBe(480)
    expect(endpointDelay('We can deploy now and')).toBe(480)
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

describe('adaptive tool gating (ATG)', () => {
  it('skips tools for purely conversational turns', () => {
    expect(utteranceNeedsTools('hi')).toBe(false)
    expect(utteranceNeedsTools('good morning')).toBe(false)
    expect(utteranceNeedsTools('how are you')).toBe(false)
  })

  it('enables tools when tool or action keywords are present', () => {
    expect(utteranceNeedsTools('search for latest quantum computing news')).toBe(true)
    expect(utteranceNeedsTools('generate an image of a cyber cat')).toBe(true)
    expect(utteranceNeedsTools('run a background task to audit the repo')).toBe(true)
  })
})

describe('silent live / speakerMuted mode', () => {
  it('supports initializing session with speakerMuted: true', async () => {
    const { createCascadeSession } = await import('./cascade')
    const session = createCascadeSession({
      provider: 'groq',
      apiKey: 'test-key',
      model: 'llama-3.3-70b-versatile',
      speakerMuted: true,
      onEvent: () => {},
    })
    expect(session.getSpeakerMuted()).toBe(true)
    session.setSpeakerMuted(false)
    expect(session.getSpeakerMuted()).toBe(false)
    await session.stop()
  })

  it('handles turn errors without ReferenceError for watchdogTimedOut', async () => {
    const { createCascadeSession } = await import('./cascade')
    const events = []
    const session = createCascadeSession({
      provider: 'nvidia',
      apiKey: 'test-key',
      model: 'non-existent-model',
      speakerMuted: true,
      onEvent: (evt) => events.push(evt),
    })

    // Submitting text triggers respondTo
    session.sendText('which is the nearest star to Sun')
    // Wait for async turn loop to process
    await new Promise((r) => setTimeout(r, 200))
    await session.stop()

    // Ensure session completed without unhandled promise rejection
    expect(events.length).toBeGreaterThan(0)
  })

  it('session.stop() performs full teardown and emits ended event instead of just interrupting', async () => {
    const { createCascadeSession } = await import('./cascade')
    const events = []
    const session = createCascadeSession({
      provider: 'groq',
      apiKey: 'test-key',
      model: 'llama-3.3-70b-versatile',
      speakerMuted: true,
      onEvent: (evt) => events.push(evt),
    })

    expect(typeof session.stop).toBe('function')
    session.stop()
    expect(events.some(e => e.type === 'ended')).toBe(true)
  })
})

describe('Gemini live session teardown', () => {
  it('session.stop() performs full teardown and emits ended event', async () => {
    const { createLiveSession } = await import('./session')
    const events = []
    const session = createLiveSession({
      apiKey: 'test-key',
      model: 'gemini-2.0-flash-exp',
      onEvent: (evt) => events.push(evt),
    })

    expect(typeof session.stop).toBe('function')
    session.stop()
    expect(events.some(e => e.type === 'ended')).toBe(true)
  })
})
