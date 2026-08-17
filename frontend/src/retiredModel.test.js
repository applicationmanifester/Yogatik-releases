import { describe, it, expect } from 'vitest'
import { isRetiredModelError } from './api'

describe('isRetiredModelError', () => {
  it('detects an explicit 410', () => {
    expect(isRetiredModelError('410: model gone')).toBe(true)
  })

  it('detects end-of-life wording', () => {
    expect(isRetiredModelError('This model is end of life')).toBe(true)
    expect(isRetiredModelError('no longer available')).toBe(true)
  })

  it('detects a 404 page-not-found', () => {
    expect(isRetiredModelError('404: page not found')).toBe(true)
  })

  it('detects the 400 rename/withdraw phrasing', () => {
    expect(isRetiredModelError('The model nvidia/foo does not exist')).toBe(true)
  })

  // REGRESSION: the message llm.js actually emits for a chat-endpoint 404 says
  // "does not serve …", never "not found" or "does not exist". It was therefore
  // NOT recognised as retired, so pruneRetiredModel never ran and the dead model
  // stayed selected — every send failed until the user changed model by hand.
  it('detects the real chat-endpoint 404 message', () => {
    const msg = 'The provider does not serve "nvidia/nemotron-3-ultra-550b-a55b" on its ' +
      'chat endpoint (404). It may be a base (non-chat) model or recently withdrawn. Pick another model.'
    expect(isRetiredModelError(msg)).toBe(true)
  })

  it('detects a bare "does not serve" 404 for any provider', () => {
    expect(isRetiredModelError('The provider does not serve "x/y" on its chat endpoint (404).')).toBe(true)
  })

  it('does NOT treat a rate limit as retirement', () => {
    expect(isRetiredModelError('429: too many requests')).toBe(false)
  })

  it('does NOT treat a server error as retirement', () => {
    expect(isRetiredModelError('500: internal server error')).toBe(false)
  })

  it('does NOT treat a network failure as retirement', () => {
    expect(isRetiredModelError('Failed to fetch')).toBe(false)
  })

  it('does NOT treat an auth failure as retirement', () => {
    expect(isRetiredModelError('401: invalid api key')).toBe(false)
  })

  it('handles empty and undefined input', () => {
    expect(isRetiredModelError('')).toBe(false)
    expect(isRetiredModelError()).toBe(false)
  })
})

import { chainExhaustedMessage } from './api'

describe('chainExhaustedMessage', () => {
  const providers = {
    ollama: { name: 'Ollama', noKey: true },
    local: { name: 'On-device', noKey: true },
    nvidia: { name: 'NVIDIA (Free)' },
    groq: { name: 'Groq' },
  }

  // The old text was always "No provider with a working key could answer."
  // Ollama needs NO key, so that sent people hunting for a key problem when the
  // real cause was the daemon not running.
  it('tells you to start the service when the whole chain is keyless', () => {
    const m = chainExhaustedMessage(['ollama'], providers)
    expect(m).toMatch(/ollama/i)
    expect(m).not.toMatch(/working key/i)
    expect(m).toMatch(/running|start/i)
  })

  it('names every keyless provider tried', () => {
    expect(chainExhaustedMessage(['ollama', 'local'], providers)).toMatch(/On-device/)
  })

  it('keeps the key wording when the chain is all cloud providers', () => {
    expect(chainExhaustedMessage(['nvidia', 'groq'], providers)).toMatch(/key/i)
  })

  it('covers both causes for a mixed chain', () => {
    const m = chainExhaustedMessage(['ollama', 'nvidia'], providers)
    expect(m).toMatch(/key/i)
    expect(m).toMatch(/local|running/i)
  })

  it('falls back safely for an empty chain', () => {
    expect(typeof chainExhaustedMessage([], providers)).toBe('string')
    expect(chainExhaustedMessage([], providers).length).toBeGreaterThan(0)
  })
})
