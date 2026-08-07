import { describe, it, expect } from 'vitest'
import {
  toGeminiTools, buildSetup, decodeServerMessage, rateFromMime,
  audioChunk, videoFrame, toolResponse, liveEndpoint,
} from './protocol'

describe('tool schema conversion', () => {
  it('flattens OpenAI schemas into one functionDeclarations block', () => {
    const out = toGeminiTools([
      { type: 'function', function: { name: 'a', description: 'A.', parameters: { type: 'object', properties: { q: { type: 'string' } }, required: ['q'] } } },
      { type: 'function', function: { name: 'b', description: 'B.', parameters: { type: 'object', properties: {} } } },
    ])
    expect(out).toHaveLength(1)
    expect(out[0].functionDeclarations.map(d => d.name)).toEqual(['a', 'b'])
    expect(out[0].functionDeclarations[0].parameters.required).toEqual(['q'])
  })

  it('omits parameters for parameterless tools', () => {
    // Gemini 400s on an empty-property object here.
    const [t] = toGeminiTools([{ function: { name: 'ping', parameters: { type: 'object', properties: {} } } }])
    expect(t.functionDeclarations[0].parameters).toBeUndefined()
  })

  it('strips JSON-Schema keywords Gemini rejects', () => {
    const [t] = toGeminiTools([{ function: {
      name: 'x',
      parameters: {
        type: 'object',
        additionalProperties: false,
        $schema: 'http://json-schema.org/draft-07/schema#',
        properties: { n: { type: 'number', default: 3, title: 'N' } },
      },
    } }])
    const p = t.functionDeclarations[0].parameters
    expect(p.additionalProperties).toBeUndefined()
    expect(p.$schema).toBeUndefined()
    expect(p.properties.n.default).toBeUndefined()
    expect(p.properties.n.type).toBe('number')
  })

  it('returns undefined when there are no tools', () => {
    expect(toGeminiTools([])).toBeUndefined()
  })
})

describe('setup message', () => {
  const setup = () => buildSetup({ model: 'm', systemInstruction: 'hi', schemas: [], voice: 'Kore' }).setup

  it('asks for audio out, both transcripts and barge-in', () => {
    const s = setup()
    expect(s.model).toBe('models/m')
    expect(s.generationConfig.responseModalities).toEqual(['AUDIO'])
    expect(s.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName).toBe('Kore')
    expect(s.inputAudioTranscription).toBeDefined()
    expect(s.outputAudioTranscription).toBeDefined()
    expect(s.realtimeInputConfig.activityHandling).toBe('START_OF_ACTIVITY_INTERRUPTS')
  })

  it('enables sliding-window compression so sessions do not die at the context limit', () => {
    expect(setup().contextWindowCompression.slidingWindow).toBeDefined()
  })

  it('passes a resumption handle only when reconnecting', () => {
    expect(setup().sessionResumption).toEqual({})
    const r = buildSetup({ model: 'm', systemInstruction: 'x', resume: 'h1' }).setup
    expect(r.sessionResumption).toEqual({ handle: 'h1' })
  })
})

describe('client messages', () => {
  it('tags audio with the 16kHz PCM mime the API requires', () => {
    expect(audioChunk('AAAA')).toEqual({
      realtimeInput: { audio: { data: 'AAAA', mimeType: 'audio/pcm;rate=16000' } },
    })
  })
  it('sends frames as JPEG', () => {
    expect(videoFrame('ZZ').realtimeInput.video.mimeType).toBe('image/jpeg')
  })
  it('matches tool responses back by id', () => {
    const m = toolResponse([{ id: 'c1', name: 'weather', result: { t: 20 } }])
    expect(m.toolResponse.functionResponses[0]).toEqual({
      id: 'c1', name: 'weather', response: { result: { t: 20 } },
    })
  })
  it('url-encodes the key', () => {
    expect(liveEndpoint('a b&c')).toContain('key=a%20b%26c')
  })
})

describe('server message decoding', () => {
  it('reports setup completion', () => {
    expect(decodeServerMessage({ setupComplete: {} })).toEqual([{ type: 'ready' }])
  })

  it('puts interruption before audio so the queue is flushed first', () => {
    const ev = decodeServerMessage({
      serverContent: {
        interrupted: true,
        modelTurn: { parts: [{ inlineData: { data: 'x', mimeType: 'audio/pcm;rate=24000' } }] },
      },
    })
    expect(ev[0].type).toBe('interrupted')
    expect(ev[1].type).toBe('audio')
  })

  it('separates user and model transcripts', () => {
    const ev = decodeServerMessage({
      serverContent: {
        inputTranscription: { text: 'hello' },
        outputTranscription: { text: 'hi there' },
      },
    })
    expect(ev).toEqual([
      { type: 'transcript', role: 'user', text: 'hello' },
      { type: 'transcript', role: 'assistant', text: 'hi there' },
    ])
  })

  it('surfaces tool calls with their ids', () => {
    const [ev] = decodeServerMessage({ toolCall: { functionCalls: [{ id: 'i', name: 'n', args: { a: 1 } }] } })
    expect(ev.type).toBe('toolCall')
    expect(ev.calls[0].args).toEqual({ a: 1 })
  })

  it('only keeps resumption handles that are actually resumable', () => {
    expect(decodeServerMessage({ sessionResumptionUpdate: { resumable: false, newHandle: 'h' } })).toEqual([])
    expect(decodeServerMessage({ sessionResumptionUpdate: { resumable: true, newHandle: 'h' } }))
      .toEqual([{ type: 'resumeHandle', handle: 'h' }])
  })

  it('reports goAway so the session can reconnect before being dropped', () => {
    expect(decodeServerMessage({ goAway: { timeLeft: '10s' } })[0].type).toBe('goAway')
  })

  it('ignores junk', () => {
    expect(decodeServerMessage(null)).toEqual([])
    expect(decodeServerMessage({})).toEqual([])
  })
})

describe('rateFromMime', () => {
  it('reads the declared rate rather than assuming 24k', () => {
    expect(rateFromMime('audio/pcm;rate=16000')).toBe(16000)
    expect(rateFromMime('audio/pcm')).toBe(24000)
    expect(rateFromMime(undefined)).toBe(24000)
  })
})
